function scanUntil(text, start, stopAtSemicolon = false) {
  let quote = "";
  let escaped = false;
  let depth = 0;
  for (let index = start; index < text.length; index += 1) {
    const char = text[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === "\\") {
      escaped = true;
      continue;
    }
    if (quote) {
      if (char === quote) quote = "";
      continue;
    }
    if (char === "'" || char === '"' || char === "`") {
      quote = char;
      continue;
    }
    if ("({[".includes(char)) depth += 1;
    if (")}]".includes(char)) {
      if (depth === 0 && char === "}") return index;
      depth -= 1;
    }
    if (stopAtSemicolon && char === ";" && depth === 0) return index;
  }
  return text.length;
}

function extractInterpolations(text) {
  const expressions = [];
  let cursor = 0;
  while (cursor < text.length) {
    const start = text.indexOf("${", cursor);
    if (start < 0) break;
    const end = scanUntil(text, start + 2);
    expressions.push(text.slice(start + 2, end));
    cursor = end + 1;
  }
  return expressions;
}

function splitTopLevelTernary(expression) {
  let quote = "";
  let escaped = false;
  let depth = 0;
  let question = -1;
  let nested = 0;
  for (let index = 0; index < expression.length; index += 1) {
    const char = expression[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === "\\") {
      escaped = true;
      continue;
    }
    if (quote) {
      if (char === quote) quote = "";
      continue;
    }
    if (char === "'" || char === '"' || char === "`") {
      quote = char;
      continue;
    }
    if ("({[".includes(char)) depth += 1;
    if (")}]".includes(char)) depth -= 1;
    if (depth !== 0) continue;
    if (char === "?") {
      if (question < 0) question = index;
      else nested += 1;
    }
    if (char === ":" && question >= 0) {
      if (nested > 0) nested -= 1;
      else {
        return [
          expression.slice(question + 1, index),
          expression.slice(index + 1),
        ];
      }
    }
  }
  return null;
}

function findAssignments(context, identifier) {
  const escaped = identifier.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(
    `(?<![\\w.])(?:(?:const|let|var)\\s+)?${escaped}\\s*=\\s*`,
    "g",
  );
  const assignments = [];
  for (const match of context.matchAll(pattern)) {
    const start = match.index + match[0].length;
    assignments.push(context.slice(start, scanUntil(context, start, true)).trim());
  }
  return assignments;
}

function isStringLiteral(value) {
  const trimmed = value.trim();
  return (
    (trimmed.startsWith("'") && trimmed.endsWith("'")) ||
    (trimmed.startsWith('"') && trimmed.endsWith('"'))
  );
}

function proveExpression(expression, context, stack = new Set()) {
  const trimmed = expression.trim().replace(/^\((.*)\)$/s, "$1").trim();
  if (/^(?:escapeHtml|timeForToday)\([\s\S]*\)$/.test(trimmed)) return true;
  const ternary = splitTopLevelTernary(trimmed);
  if (ternary) return ternary.every((branch) => proveValue(branch, context, stack));
  if (isStringLiteral(trimmed)) return true;
  if (trimmed.startsWith("`") && trimmed.endsWith("`")) {
    return extractInterpolations(trimmed).every((nested) =>
      proveExpression(nested, context, stack),
    );
  }
  if (!/^[A-Za-z_$][\w$]*$/.test(trimmed) || stack.has(trimmed)) return false;
  const assignments = findAssignments(context, trimmed);
  if (!assignments.length) return false;
  const nextStack = new Set(stack).add(trimmed);
  return assignments.every((value) => proveValue(value, context, nextStack));
}

function proveValue(value, context, stack = new Set()) {
  const trimmed = value.trim();
  if (isStringLiteral(trimmed)) return true;
  if (trimmed.startsWith("`") && trimmed.endsWith("`")) {
    return extractInterpolations(trimmed).every((expression) =>
      proveExpression(expression, context, stack),
    );
  }
  return proveExpression(trimmed, context, stack);
}

function scopeAtLine(source, line) {
  const lines = source.split(/\r?\n/);
  let start = Math.max(0, line - 1);
  while (
    start > 0 &&
    !/^(?:async\s+)?function\s+/.test(lines[start].trim())
  ) {
    start -= 1;
  }
  let end = start + 1;
  while (
    end < lines.length &&
    !/^(?:async\s+)?function\s+/.test(lines[end].trim())
  ) {
    end += 1;
  }
  return lines.slice(start, end).join("\n");
}

function proveNotificationStateRenderer(source) {
  const start = source.indexOf("function renderNotificationState");
  const end = source.indexOf("function getAnnouncementNotificationTitle", start);
  if (start < 0 || end < 0) return false;
  const renderer = source.slice(start, end);
  return extractInterpolations(renderer).every((expression) =>
    proveExpression(expression, renderer),
  );
}

export function proveSinkRhs(match, source) {
  const value = match.metaVariables.single.VALUE.text.trim();
  if (isStringLiteral(value)) {
    return { safe: true, proof: "string literal" };
  }
  if (value.startsWith("`") && value.endsWith("`") && !value.includes("${")) {
    return { safe: true, proof: "static template" };
  }
  const scope = scopeAtLine(source, match.range.start.line + 1);
  if (value.startsWith("renderNotificationState(")) {
    const argumentsText = value.slice(
      value.indexOf("(") + 1,
      value.lastIndexOf(")"),
    );
    const argumentsSafe = argumentsText
      .split(",")
      .map((argument) => argument.trim())
      .filter(Boolean)
      .every(isStringLiteral);
    return {
      safe: argumentsSafe && proveNotificationStateRenderer(source),
      proof: "literal call arguments and independently proven renderer",
    };
  }
  const expressions = extractInterpolations(value);
  return {
    safe:
      expressions.length > 0 &&
      expressions.every((expression) => proveExpression(expression, scope)),
    proof: "every interpolation resolves to a literal, sanitizer, or proven alias",
  };
}
