jest.mock("firebase/storage", () => ({
  ref: jest.fn(),
  uploadBytes: jest.fn(),
  getDownloadURL: jest.fn(),
  deleteObject: jest.fn(),
}));

jest.mock("../../utils/firebase", () => ({
  storage: { name: "mock-storage" },
}));

const {
  ref,
  uploadBytes,
  getDownloadURL,
  deleteObject,
} = require("firebase/storage");
const {
  uploadToStorage,
  deleteFromStorage,
  deleteMultipleFromStorage,
} = require("../../utils/uploadToStorage");
const { storage } = require("../../utils/firebase");

describe("uploadToStorage", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("uploads blob using sanitized unique file name and returns URL", async () => {
    jest.spyOn(Date, "now").mockReturnValue(1700000000000);
    ref.mockReturnValue({ fullPath: "profiles/1700000000000-a_b.png" });
    getDownloadURL.mockResolvedValue("https://download/url");

    const result = await uploadToStorage({}, "profiles", "a b.png");

    expect(ref).toHaveBeenCalledWith(storage, "profiles/1700000000000-a_b.png");
    expect(uploadBytes).toHaveBeenCalledWith(
      { fullPath: "profiles/1700000000000-a_b.png" },
      {}
    );
    expect(result).toBe("https://download/url");
  });
});

describe("deleteFromStorage", () => {
  const url =
    "https://firebasestorage.googleapis.com/v0/b/demo/o/folder%2Ffile.jpg?alt=media";

  it("extracts path from URL and deletes object", async () => {
    ref.mockReturnValue({ fullPath: "folder/file.jpg" });

    await deleteFromStorage(url);

    expect(ref).toHaveBeenCalledWith(storage, "folder/file.jpg");
    expect(deleteObject).toHaveBeenCalledWith({ fullPath: "folder/file.jpg" });
  });

  it("returns early when URL is missing", async () => {
    await expect(deleteFromStorage("")).resolves.toBeUndefined();
    expect(deleteObject).not.toHaveBeenCalled();
  });

  it("swallows object-not-found errors", async () => {
    ref.mockReturnValue({ fullPath: "folder/file.jpg" });
    deleteObject.mockRejectedValue({ code: "storage/object-not-found" });

    await expect(deleteFromStorage(url)).resolves.toBeUndefined();
  });
});

describe("deleteMultipleFromStorage", () => {
  const urls = [
    "https://firebasestorage.googleapis.com/v0/b/demo/o/a%2F1.jpg?alt=media",
    "https://firebasestorage.googleapis.com/v0/b/demo/o/a%2F2.jpg?alt=media",
  ];

  it("deletes each URL when list is provided", async () => {
    ref.mockImplementation((_, path) => ({ fullPath: path }));

    await deleteMultipleFromStorage(urls);

    expect(deleteObject).toHaveBeenCalledTimes(2);
  });

  it("returns early for empty list", async () => {
    await expect(deleteMultipleFromStorage([])).resolves.toBeUndefined();
  });
});
