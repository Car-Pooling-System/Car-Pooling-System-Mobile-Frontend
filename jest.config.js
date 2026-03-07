export const testEnvironment = "node";
export const transform = {
  "^.+\\.[jt]sx?$": "babel-jest",
};
export const testMatch = ["**/__tests__/**/*.test.js"];
export const clearMocks = true;
