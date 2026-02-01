// env-config.js
const debug = process.env.NODE_ENV !== "production";

module.exports = {
  "process.env.BACKEND_URL": !debug ? "https://headF1rst.github.io/TIL" : "",
};

// .babelrc.js
const env = require("./env-config");

module.exports = {
  presets: ["next/babel"],
  plugins: [["transform-define", env]],
};
