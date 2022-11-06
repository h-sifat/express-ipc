const path = require("path");

module.exports = {
  mode: "production",
  entry: {
    index: "./src/index.ts",
    server: "./src/server.ts",
    client: "./src/client.ts",
  },
  module: {
    rules: [
      {
        test: /\.ts/,
        use: "ts-loader",
        exclude: /node_modules/,
      },
    ],
  },
  resolve: {
    extensions: [".ts"],
  },

  externals: {
    "handy-types": "umd handy-types",
    "path-to-regexp": "path-to-regexp",
  },

  externalsPresets: {
    node: true,
  },

  output: {
    clean: true,
    path: path.resolve(__dirname, "dist"),
    filename: "[name].js",
    globalObject: "this",
    library: { type: "umd" },
  },
};
