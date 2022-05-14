const HtmlWebPackPlugin = require("html-webpack-plugin");
const ModuleFederationPlugin = require("webpack/lib/container/ModuleFederationPlugin");
const GenerateJsonWebpackPlugin = require("generate-json-webpack-plugin");

// JSON config of the component.
// This will be used by Zint what scope and modules are available in the build.
const zintComponentInfo = require("./zint.component.json");
const componentConfigJson = {
  scope: zintComponentInfo.scope,
  modules: Object.keys(zintComponentInfo.exposes),
  stub: zintComponentInfo.stub,
  stubVersion: zintComponentInfo.stubVersion
};

const deps = require("./package.json").dependencies;
config = {
  output: {
    publicPath: "http://localhost:3030/",
  },

  resolve: {
    extensions: [".jsx", ".js", ".ts", ".tsx", ".json"],
  },

  devServer: {
    port: 3030,
  },

  module: {
    rules: [
      {
        test: /\.m?js/,
        type: "javascript/auto",
        resolve: {
          fullySpecified: false,
        },
      },
      {
        test: /\.bin/,
        exclude: /node_modules/,
        use: [
          {
            loader: "url-loader",
            options: {
              encoding: false,
              mimetype: false,
              generator: (content) => {
                return content;
              },
            },
          },
        ],
      },
      {
        test: /\.css$/i,
        use: ["style-loader", "css-loader"],
      },
      {
        test: /\.(js|jsx|tsx|ts)$/,
        exclude: /node_modules/,
        use: {
          loader: "babel-loader",
        },
      },
      {
        test: /\.(tsx|ts)$/,
        exclude: /node_modules/,
        use: {
          loader: "ts-loader",
          options: {
            transpileOnly: true,
          },
        },
      },
    ],
  },

  plugins: [
    new ModuleFederationPlugin({
      name: zintComponentInfo.scope,
      filename: "remoteEntry.js",
      remotes: {},
      exposes: zintComponentInfo.exposes,
      shared: {
        ...deps,
        react: {
          singleton: true,
          requiredVersion: deps.react,
        },
        "react-dom": {
          singleton: true,
          requiredVersion: deps["react-dom"],
        },
      },
    }),
    new GenerateJsonWebpackPlugin(
      "component.config.json",
      componentConfigJson,
      undefined /* no replacer */,
      2 /* spaces for prettyPrint */
    ),
  ],
};

module.exports = (env, argv) => {
  if (argv.mode === "production") {
    /* This is a special public path value that Zint will replace at
       runtime when the component is used. Please do not modify it! */
    config.output.publicPath = "http://zint-component-server";
  } else {
    config.entry = "./test-app";
    config.plugins.push(
      new HtmlWebPackPlugin({
        template: "./test-app/index.html",
      })
    );
  }

  return config;
};
