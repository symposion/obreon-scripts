module.exports = {
  module: {
    loaders: [
      { test: /\.json$/, loader: 'json' },
    ],
  },
  output: {
    path: __dirname,
    filename: 'ObreonScripts.js',
    library: 'ObreonScripts',
  },
  externals: {
    underscore: '_',
  },
};
