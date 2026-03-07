const { getFileExtension, uriToBlob } = require("../../utils/imageHelper");

describe("getFileExtension", () => {
  it("extracts extension from URI and strips query params", () => {
    const uri = "file:///tmp/profile.image.png?token=123";
    expect(getFileExtension(uri)).toBe("png");
  });

  it("falls back to MIME type when URI has no extension", () => {
    expect(getFileExtension("content://provider/image", "image/webp")).toBe(
      "webp"
    );
  });

  it("returns jpg for unknown MIME type or missing values", () => {
    expect(getFileExtension("content://provider/image", "image/tiff")).toBe(
      "jpg"
    );
    expect(getFileExtension(undefined, undefined)).toBe("jpg");
  });
});

describe("uriToBlob", () => {
  const OriginalXHR = global.XMLHttpRequest;

  afterEach(() => {
    global.XMLHttpRequest = OriginalXHR;
  });

  it("resolves with xhr response when request succeeds", async () => {
    const blob = { type: "blob", data: "ok" };
    const open = jest.fn();
    const send = jest.fn(function () {
      this.response = blob;
      this.onload();
    });

    global.XMLHttpRequest = jest.fn(function () {
      this.open = open;
      this.send = send;
      this.responseType = "";
      this.onload = null;
      this.onerror = null;
      this.response = null;
    });

    await expect(uriToBlob("file:///image.png")).resolves.toBe(blob);
    expect(open).toHaveBeenCalledWith("GET", "file:///image.png", true);
    expect(send).toHaveBeenCalledWith(null);
  });

  it("rejects when request errors", async () => {
    const send = jest.fn(function () {
      this.onerror();
    });

    global.XMLHttpRequest = jest.fn(function () {
      this.open = jest.fn();
      this.send = send;
      this.responseType = "";
      this.onload = null;
      this.onerror = null;
    });

    await expect(uriToBlob("file:///image.png")).rejects.toThrow(
      "Failed to convert URI to blob"
    );
  });
});
