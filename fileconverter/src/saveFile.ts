import { saveAs } from 'file-saver';

type FileType = { description: string; mimeType: string; extension: string };

type SaveFilePicker = (options: {
  suggestedName?: string;
  types?: { description: string; accept: Record<string, string[]> }[];
}) => Promise<FileSystemFileHandle>;

type RemovableHandle = FileSystemFileHandle & { remove?: () => Promise<void> };

export type SaveTarget = {
  name: string;
  save: (createBlob: () => Promise<Blob>) => Promise<void>;
};

async function removeIfEmpty(handle: RemovableHandle) {
  try {
    if ((await handle.getFile()).size > 0) return true;
    if (!handle.remove) return false;
    await handle.remove();
    return true;
  } catch {
    return false;
  }
}

export async function chooseSaveLocation(suggestedName: string, type: FileType): Promise<SaveTarget | null> {
  const showSaveFilePicker = (window as { showSaveFilePicker?: SaveFilePicker }).showSaveFilePicker;
  if (!showSaveFilePicker) {
    return { name: suggestedName, save: async (createBlob) => saveAs(await createBlob(), suggestedName) };
  }

  let handle: FileSystemFileHandle;
  try {
    handle = await showSaveFilePicker({
      suggestedName,
      types: [{ description: type.description, accept: { [type.mimeType]: [type.extension] } }],
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') return null;
    throw error;
  }
  return {
    name: handle.name,
    save: async (createBlob) => {
      try {
        const blob = await createBlob();
        const writable = await handle.createWritable();
        try {
          await writable.write(blob);
        } catch (error) {
          await writable.abort().catch(() => {});
          throw error;
        }
        await writable.close();
      } catch (error) {
        if (!(await removeIfEmpty(handle))) {
          const detail = error instanceof Error ? error.message : String(error);
          throw new Error(`${detail} The empty file ${handle.name} could not be deleted.`, { cause: error });
        }
        throw error;
      }
    },
  };
}
