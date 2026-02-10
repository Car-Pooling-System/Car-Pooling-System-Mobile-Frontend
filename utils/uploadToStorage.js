import { ref, uploadBytes, getDownloadURL, deleteObject } from "firebase/storage";
import { storage } from "./firebase";

/**
 * Upload file to Firebase Storage and return download URL
 * @param {Blob} blob - The file blob to upload
 * @param {string} path - The storage path where file will be saved
 * @param {string} fileName - The name of the file
 * @returns {Promise<string>} Download URL
 */
export const uploadToStorage = async (blob, path, fileName) => {
    try {
        const safeFileName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
        const uniqueName = `${Date.now()}-${safeFileName}`;

        const fileRef = ref(storage, `${path}/${uniqueName}`);

        await uploadBytes(fileRef, blob);
        const downloadURL = await getDownloadURL(fileRef);

        return downloadURL;
    } catch (error) {
        console.error("Error uploading to storage:", error);
        throw error;
    }
};

/**
 * Delete file from Firebase Storage using its download URL
 * @param {string} url - The file URL to delete
 */
export const deleteFromStorage = async (url) => {
    if (!url) return;

    try {
        // Extract the path from the URL
        const urlObj = new URL(url);
        const pathMatch = urlObj.pathname.match(/\/o\/(.+)$/);

        if (!pathMatch) {
            console.warn("Could not extract path from URL");
            return;
        }

        const filePath = decodeURIComponent(pathMatch[1]);
        const fileRef = ref(storage, filePath);

        await deleteObject(fileRef);
        console.log("File deleted successfully:", url);
    } catch (error) {
        console.error("Error deleting file:", error);

        if (error.code === 'storage/object-not-found') {
            console.warn("File already doesn't exist or was never uploaded");
        } else if (error.code === 'storage/unauthorized') {
            console.error("Permission denied - check Firebase Storage rules");
        }
    }
};

/**
 * Delete multiple files from Firebase Storage
 * @param {string[]} urls - Array of file URLs to delete
 */
export const deleteMultipleFromStorage = async (urls) => {
    if (!urls || urls.length === 0) return;

    try {
        await Promise.all(urls.map(url => deleteFromStorage(url)));
        console.log("Multiple files deleted successfully");
    } catch (error) {
        console.error("Error deleting multiple files:", error);
    }
};
