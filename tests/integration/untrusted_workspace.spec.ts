import { chmod, rm, writeFile } from "node:fs/promises";
import * as path from "node:path";
import { strictEqual } from "assert";
import { commands, Uri, window, workspace } from "vscode";
import {
  activateExtension,
  deleteFixtures,
  getDiagnostics,
  loadFixture,
  sleep,
  WORKSPACE_DIR,
} from "../test-helpers";

const workspacePath = WORKSPACE_DIR.fsPath;
const binDir = path.join(workspacePath, "node_modules", ".bin");
const lintMarkerPath = path.join(workspacePath, "oxlint-ran.marker");
const fmtMarkerPath = path.join(workspacePath, "oxfmt-ran.marker");

async function createFakeBinary(binaryName: string, markerPath: string): Promise<void> {
  const binaryPath = path.join(binDir, binaryName);
  const script = `#!/bin/sh
echo ran > "${markerPath}"
exit 1
`;

  await writeFile(binaryPath, script, { encoding: "utf8" });
  await chmod(binaryPath, 0o755);
}

suiteSetup(async () => {
  await workspace.fs.createDirectory(Uri.file(binDir));
  await createFakeBinary("oxlint", lintMarkerPath);
  await createFakeBinary("oxfmt", fmtMarkerPath);
  await activateExtension(false);
});

teardown(async () => {
  await workspace.getConfiguration("editor").update("defaultFormatter", undefined);
  await workspace.saveAll();
  await deleteFixtures();
  await rm(lintMarkerPath, { force: true });
  await rm(fmtMarkerPath, { force: true });
});

suiteTeardown(async () => {
  await workspace.fs.delete(Uri.file(path.join(workspacePath, "node_modules")), {
    recursive: true,
    useTrash: false,
  });
});

suite("Untrusted Workspace", () => {
  test("does not execute workspace-local oxlint in Restricted Mode", async () => {
    await loadFixture("debugger");
    const diagnostics = await getDiagnostics("debugger.js", undefined, 500);

    strictEqual(diagnostics.length, 0);

    try {
      await workspace.fs.stat(Uri.file(lintMarkerPath));
      strictEqual(true, false, "workspace-local oxlint should not have been executed");
    } catch {
      // expected
    }
  });

  test("does not execute workspace-local oxfmt in Restricted Mode", async () => {
    await workspace.getConfiguration("editor").update("defaultFormatter", "oxc.oxc-vscode");
    await workspace.saveAll();
    await loadFixture("formatting");

    const fileUri = Uri.joinPath(WORKSPACE_DIR, "fixtures", "formatting.ts");
    const document = await workspace.openTextDocument(fileUri);
    await window.showTextDocument(document);
    await sleep(500);
    await commands.executeCommand("editor.action.formatDocument");
    await workspace.saveAll();

    const content = await workspace.fs.readFile(fileUri);
    strictEqual(content.toString(), "class X{foo(){return 42;}}\n");

    try {
      await workspace.fs.stat(Uri.file(fmtMarkerPath));
      strictEqual(true, false, "workspace-local oxfmt should not have been executed");
    } catch {
      // expected
    }
  });
});
