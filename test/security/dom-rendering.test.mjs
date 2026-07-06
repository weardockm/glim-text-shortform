import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const source = readFileSync(new URL("../../index.js", import.meta.url), "utf8");
const payloads = [
  '<img src=x onerror="globalThis.__xss=1">',
  "<script>globalThis.__xss=1</script>",
  "javascript:globalThis.__xss=1",
  `prefix\u0000\u0008${"가".repeat(20_000)}suffix`,
];

class FakeElement {
  constructor(tagName = "div") {
    this.tagName = tagName;
    this.className = "";
    this.dataset = {};
    this.style = {};
    this.textAssignments = [];
    this.htmlAssignments = [];
    this.childrenBySelector = new Map();
    this.children = [];
    this.classList = { add() {}, remove() {} };
  }

  set innerHTML(value) {
    this.htmlAssignments.push(String(value));
  }

  set textContent(value) {
    this.textAssignments.push(String(value));
  }

  set innerText(value) {
    this.textAssignments.push(String(value));
  }

  querySelector(selector) {
    if (!this.childrenBySelector.has(selector)) {
      this.childrenBySelector.set(selector, new FakeElement(selector));
    }
    return this.childrenBySelector.get(selector);
  }

  addEventListener() {}
  append(...children) {
    this.children.push(...children);
  }

  after(child) {
    this.children.push(child);
  }
  remove() {}
}

function extractFunction(name, nextDeclaration) {
  const start = source.indexOf(`function ${name}`);
  const end = source.indexOf(`\n${nextDeclaration}`, start);
  assert.ok(start >= 0 && end > start, `cannot extract ${name}`);
  return source.slice(start, end);
}

function createContext() {
  const context = {
    document: { createElement: (tagName) => new FakeElement(tagName) },
    currentUser: null,
    likedPostIds: new Set(),
    bookmarkedPostIds: new Set(),
    likedCommentIds: new Set(),
    timeForToday: () => "방금 전",
    createPostBgmControl: () => null,
    incrementMetric() {},
    openSheet() {},
    toggleBookmark() {},
    toggleMoreMenu() {},
    deletePost() {},
    reportPost() {},
    sharePost() {},
    openUserProfile() {},
    toggleCommentLike() {},
    reportComment() {},
    renderAvatarElement() {},
    getMoodOption: () => ({ label: "생각" }),
    openContextPostFeed() {},
    result: null,
  };
  vm.createContext(context);
  vm.runInContext(
    [
      extractFunction("escapeHtml", "function setAppAlertVerification"),
      extractFunction("createContextFeedPost", "function renderContextPostFeed"),
      extractFunction("createExploreUserResult", "function createExploreSearchPost"),
      extractFunction("createExploreSearchPost", "function renderExploreSearchLoading"),
      extractFunction("createCommentElement", "async function fetchComments"),
      extractFunction("renderNotificationState", "function getAnnouncementNotificationTitle"),
    ].join("\n"),
    context,
  );
  return context;
}

function allHtmlAssignments(root) {
  return [
    ...root.htmlAssignments,
    ...root.children.flatMap(allHtmlAssignments),
    ...[...root.childrenBySelector.values()].flatMap(allHtmlAssignments),
  ];
}

function allTextAssignments(root) {
  return [
    ...root.textAssignments,
    ...root.children.flatMap(allTextAssignments),
    ...[...root.childrenBySelector.values()].flatMap(allTextAssignments),
  ];
}

test("Given untrusted post text, When the production post renderer runs, Then payloads reach text sinks only", () => {
  for (const payload of payloads) {
    const context = createContext();
    context.payload = payload;
    vm.runInContext(
      "result = createContextFeedPost({ id: 'p1', user_id: 'u1', content: payload, author: payload, created_at: '2026-01-01', likes_count: 0, dislikes_count: 0 })",
      context,
    );

    assert.ok(allTextAssignments(context.result).includes(payload));
    assert.ok(allHtmlAssignments(context.result).every((html) => !html.includes(payload)));
    assert.equal(context.__xss, undefined);
  }
});

test("Given untrusted comment text, When the production comment renderer runs, Then payloads reach text sinks only", () => {
  for (const payload of payloads) {
    const context = createContext();
    context.payload = payload;
    vm.runInContext(
      "result = createCommentElement({ id: 'c1', user_id: 'u1', user_email: payload, content: payload, likes_count: 0 })",
      context,
    );

    assert.ok(allTextAssignments(context.result).some((value) => value.includes(payload)));
    assert.ok(allHtmlAssignments(context.result).every((html) => !html.includes(payload)));
    assert.equal(context.__xss, undefined);
  }
});

test("Given untrusted profile and search text, When production result renderers run, Then no HTML sink receives it", () => {
  for (const payload of payloads) {
    const context = createContext();
    context.payload = payload;
    vm.runInContext(
      "result = createExploreUserResult({ id: 'u1', nickname: payload, custom_id: payload, avatar_url: '' })",
      context,
    );
    assert.ok(allTextAssignments(context.result).some((value) => value.includes(payload)));
    assert.equal(allHtmlAssignments(context.result).length, 0);

    vm.runInContext(
      "result = createExploreSearchPost({ id: 'p1', content: payload, author: payload, mood: '사색', likes_count: 0 }, 0)",
      context,
    );
    assert.ok(allTextAssignments(context.result).includes(payload));
    assert.equal(allHtmlAssignments(context.result).length, 0);
    assert.equal(context.__xss, undefined);
  }
});

test("Given untrusted notification state text, When production HTML is built, Then reserved characters are escaped", () => {
  for (const payload of payloads) {
    const context = createContext();
    context.payload = payload;
    vm.runInContext("result = renderNotificationState(payload, payload, payload)", context);
    assert.ok(!context.result.includes("<script>"));
    assert.ok(!context.result.includes("<img"));
    assert.equal(context.__xss, undefined);
  }
});
