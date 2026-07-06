import { spawn, spawnSync } from "node:child_process";
import { writeFile } from "node:fs/promises";
import process from "node:process";

export function spawnOwned(command, args, options = {}) {
  return spawn(command, args, {
    ...options,
    detached: process.platform !== "win32",
  });
}

function waitForExit(child, timeoutMs) {
  if (child.exitCode !== null || child.signalCode !== null) {
    return Promise.resolve(true);
  }
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      child.off("close", onClose);
      resolve(false);
    }, timeoutMs);
    const onClose = () => {
      clearTimeout(timeout);
      resolve(true);
    };
    child.once("close", onClose);
  });
}

async function terminateWindowsTree(child) {
  const result = spawnSync(
    "taskkill.exe",
    ["/PID", `${child.pid}`, "/T", "/F"],
    {
      encoding: "utf8",
      timeout: 2_000,
      windowsHide: true,
    },
  );
  if (result.status === 0) {
    return;
  }

  const script = [
    "$rootPid = [int]$args[0]",
    "function Stop-Descendants([int]$parentPid) {",
    "  $children = @(Get-CimInstance Win32_Process -Filter \"ParentProcessId = $parentPid\" -ErrorAction SilentlyContinue)",
    "  foreach ($child in $children) {",
    "    Stop-Descendants ([int]$child.ProcessId)",
    "    Stop-Process -Id ([int]$child.ProcessId) -Force -ErrorAction SilentlyContinue",
    "  }",
    "}",
    "Stop-Descendants $rootPid",
    "Stop-Process -Id $rootPid -Force -ErrorAction SilentlyContinue",
  ].join("; ");
  const fallback = spawnSync(
    "powershell.exe",
    ["-NoProfile", "-NonInteractive", "-Command", script, `${child.pid}`],
    {
      encoding: "utf8",
      timeout: 3_000,
      windowsHide: true,
    },
  );
  return fallback.status === 0;
}

export async function terminateOwnedProcessTree(child, options = {}) {
  if (!child?.pid) {
    return;
  }
  if (
    !options.forceDescendants &&
    (child.exitCode !== null || child.signalCode !== null)
  ) {
    return;
  }

  if (options.cancelFile) {
    await writeFile(options.cancelFile, "cancel\n", "utf8");
    if (await waitForExit(child, 1_000)) {
      return;
    }
  }

  if (process.platform === "win32") {
    await terminateWindowsTree(child);
  } else {
    try {
      process.kill(-child.pid, "SIGTERM");
    } catch (error) {
      if (error?.code !== "ESRCH") {
        throw error;
      }
    }
  }

  if (await waitForExit(child, 500)) {
    return;
  }

  if (process.platform === "win32") {
    child.kill("SIGKILL");
  } else {
    try {
      process.kill(-child.pid, "SIGKILL");
    } catch (error) {
      if (error?.code !== "ESRCH") {
        throw error;
      }
    }
  }
  if (!(await waitForExit(child, 500))) {
    process.stderr.write(`PROCESS_TREE_TERMINATION_FAILED pid=${child.pid}\n`);
  }
}
