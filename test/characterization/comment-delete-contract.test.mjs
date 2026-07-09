import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const source = readFileSync(new URL("../../index.js", import.meta.url), "utf8");

function extractFunction(name, nextDeclaration) {
  const functionStart = source.indexOf(`function ${name}`);
  const asyncFunctionStart = source.indexOf(`async function ${name}`);
  const starts = [functionStart, asyncFunctionStart].filter((index) => index >= 0);
  const start = Math.min(...starts);
  const end = source.indexOf(`
${nextDeclaration}`, start);
  assert.ok(Number.isFinite(start) && start >= 0 && end > start, `cannot extract ${name}`);
  return source.slice(start, end);
}

function createDeleteContext({ count = 1, error = null } = {}) {
  const calls = [];
  const query = {
    eq(column, value) {
      calls.push(["eq", column, value]);
      return this;
    },
    select(value) {
      calls.push(["select", value]);
      return Promise.resolve({ data: null, error: { code: "42501" }, count: null });
    },
    then(resolve) {
      calls.push(["execute"]);
      return Promise.resolve({ data: null, error, count }).then(resolve);
    },
  };
  const context = {
    currentUser: { id: "user-1" },
    currentPostIdForComment: "post-1",
    client: {
      from(table) {
        calls.push(["from", table]);
        return {
          delete(options) {
            calls.push(["delete", options || null]);
            return query;
          },
        };
      },
    },
    likedCommentIds: new Set(["comment-1"]),
    localStorage: { removed: [] },
    alerts: [],
    fetchedCommentsFor: [],
    fetchedPostsCount: 0,
    reportClientDiagnostic() {},
    calls,
  };
  context.localStorage.removeItem = (key) => context.localStorage.removed.push(key);
  context.showAppAlert = (message) => context.alerts.push(message);
  context.fetchComments = (postId) => context.fetchedCommentsFor.push(postId);
  context.fetchPosts = () => {
    context.fetchedPostsCount += 1;
  };
  vm.createContext(context);
  vm.runInContext(extractFunction("submitCommentDelete", "async function toggleCommentLike"), context);
  return context;
}

test("Comment delete refreshes comments without replacing the open sheet source", async () => {
  const context = createDeleteContext({ count: 1 });

  await vm.runInContext("submitCommentDelete('comment-1')", context);

  assert.deepEqual(
    context.calls.filter(([kind]) => kind === "select"),
    [],
    "DELETE should not call .select(), because DELETE RETURNING can fail under RLS even when deletion is allowed",
  );
  assert.deepEqual(context.alerts, []);
  assert.deepEqual(context.fetchedCommentsFor, ["post-1"]);
  assert.equal(context.fetchedPostsCount, 0);
});

test("Comment delete reports failure when Supabase affects no rows", async () => {
  const context = createDeleteContext({ count: 0 });

  await vm.runInContext("submitCommentDelete('comment-1')", context);

  assert.deepEqual(context.fetchedCommentsFor, []);
  assert.match(context.alerts.at(-1), /댓글을 삭제하지 못했습니다/);
});
