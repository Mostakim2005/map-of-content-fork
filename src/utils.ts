import type { DBManager } from "./db";
import type { App } from "obsidian";

export const devLog = (message: string) => {
  const printDevLog = false;
  if (printDevLog) console.log("[Map of Content] " + message);
};

export const removeExtension = (path: string, extension = ".md") => {
  if (path.endsWith(extension)) return path.slice(0, -extension.length);
  return path;
};

export const isCtrlPressed = (e: MouseEvent): boolean =>
  window.navigator.userAgent.includes("Macintosh") ? e.metaKey : e.ctrlKey;

export const getFileNameFromPath = (path: string): string =>
  path.split("/").pop() ?? path;

export const getDisplayName = (path: string, db: DBManager): string => {
  const fileName = getFileNameFromPath(path);
  if (db.fileHasDuplicatedName.get(fileName) === true) return removeExtension(path);
  return removeExtension(fileName);
};

export const NavigateToFile = async (
  app: App,
  path: string,
  event: MouseEvent
) => {
  if (!app.metadataCache.getFirstLinkpathDest(path, "/")) return;
  await app.workspace.openLinkText(path, "/", isCtrlPressed(event));
};

/** Return normalized paths of all folders in the vault, including empty folders. */
export const GetAllFolders = (app: App): string[] => {
  const folders = new Set<string>();
  for (const file of app.vault.getFiles()) {
    let folder = file.parent?.path ?? "";
    while (folder) {
      folders.add(folder);
      const slash = folder.lastIndexOf("/");
      folder = slash === -1 ? "" : folder.slice(0, slash);
    }
  }
  return Array.from(folders).sort();
};
