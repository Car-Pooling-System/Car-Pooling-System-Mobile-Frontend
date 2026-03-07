const { decodePolyline } = require("../../utils/polyline");

describe("decodePolyline", () => {
  it("decodes a known polyline into latitude/longitude points", () => {
    const encoded = "_p~iF~ps|U_ulLnnqC_mqNvxq`@";

    expect(decodePolyline(encoded)).toEqual([
      { latitude: 38.5, longitude: -120.2 },
      { latitude: 40.7, longitude: -120.95 },
      { latitude: 43.252, longitude: -126.453 },
    ]);
  });

  it("returns an empty array for empty input", () => {
    expect(decodePolyline("")).toEqual([]);
    expect(decodePolyline(null)).toEqual([]);
    expect(decodePolyline(undefined)).toEqual([]);
  });
});
