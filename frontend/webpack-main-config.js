// -- copyright
// OpenProject is a project management system.
// Copyright (C) 2012-2015 the OpenProject Foundation (OPF)
//
// This program is free software; you can redistribute it and/or
// modify it under the terms of the GNU General Public License version 3.
//
// OpenProject is a fork of ChiliProject, which is a fork of Redmine. The copyright follows:
// Copyright (C) 2006-2013 Jean-Philippe Lang
// Copyright (C) 2010-2013 the ChiliProject Team
//
// This program is free software; you can redistribute it and/or
// modify it under the terms of the GNU General Public License
// as published by the Free Software Foundation; either version 2
// of the License, or (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.
//
// You should have received a copy of the GNU General Public License
// along with this program; if not, write to the Free Software
// Foundation, Inc., 51 Franklin Street, Fifth Floor, Boston, MA  02110-1301, USA.
//
// See doc/COPYRIGHT.rdoc for more details.
// ++

var webpack = require('webpack');
var fs = require('fs');
var path = require('path');
var _ = require('lodash');
var pathConfig = require('./rails-plugins.conf');
var autoprefixer = require('autoprefixer');

var TypeScriptDiscruptorPlugin = require('./webpack/typescript-disruptor.plugin.js');
var ExtractTextPlugin = require('extract-text-webpack-plugin');

var mode = (process.env['RAILS_ENV'] || 'production').toLowerCase();
var uglify = (mode !== 'development');

var node_root = path.resolve(__dirname, 'node_modules');

var pluginEntries = _.reduce(pathConfig.pluginNamesPaths, function (entries, path, name) {
  entries[name.replace(/^openproject\-/, '')] = name;
  return entries;
}, {});

var pluginAliases = _.reduce(pathConfig.pluginNamesPaths, function (entries, pluginPath, name) {
  entries[name] = path.basename(pluginPath);
  return entries;
}, {});

/** Extract available locales from openproject-translations plugin */
var translations = path.resolve(pathConfig.allPluginNamesPaths['openproject-translations'], 'config', 'locales');
var localeIds = ['en'];
fs.readdirSync(translations).forEach(function (file) {
  var matches = file.match( /^js-(.+)\.yml$/);
  if (matches && matches.length > 1) {
    localeIds.push(matches[1]);
  }
});

var loaders = [
  { test: /\.tsx?$/, loader: 'ng-annotate-loader!ts-loader'},
  {
    test: /\.css$/,
    loader: ExtractTextPlugin.extract({
      fallbackLoader: 'style-loader',
      loader: 'css-loader!postcss-loader',
      publicPath: '/assets/bundles/'
    })
  },
  {test: /\.png$/, loader: 'url-loader?limit=100000&mimetype=image/png'},
  {test: /\.gif$/, loader: 'file-loader'},
  {test: /\.jpg$/, loader: 'file-loader'},
  {test: /[\/].*\.js$/, loader: 'ng-annotate-loader?map=true'}
];

for (var k in pathConfig.pluginNamesPaths) {
  if (pathConfig.pluginNamesPaths.hasOwnProperty(k)) {
    loaders.push({
      test: new RegExp('templates/plugin-' + k.replace(/^openproject\-/, '') + '/.*\.html$'),
      loader: 'ngtemplate-loader?module=openproject.templates&relativeTo=' +
      path.join(pathConfig.pluginNamesPaths[k], 'frontend', 'app') + '!html-loader?-minimize'
    });
  }
}

loaders.push({
  test: /^((?!templates\/plugin).)*\.html$/,
  loader: 'ngtemplate-loader?module=openproject.templates&relativeTo=' +
  path.resolve(__dirname, './app') + '!html-loader?-minimize'
});

function getWebpackMainConfig() {
  config = {
    context: path.resolve(__dirname, 'app'),

    entry: _.merge({
      'core-app': './openproject-app'
    }, pluginEntries),

    output: {
      filename: 'openproject-[name].js',
      path: path.join(__dirname, '..', 'app', 'assets', 'javascripts', 'bundles'),
      publicPath: '/assets/bundles/'
    },

    module: {
      loaders: loaders
    },

    resolve: {
      modules: ['node_modules'].concat(pathConfig.pluginDirectories),

      extensions: ['.ts', '.tsx', '.js'],

      // Allow empty import without extension
      // enforceExtension: true,

      alias: _.merge({
        'locales': './../../config/locales',
        'core-components': path.resolve(__dirname, 'app', 'components'),

        'at.js': path.resolve(__dirname, 'vendor', 'at.js'),
        'select2': path.resolve(__dirname, 'vendor', 'select2'),
        'lodash': path.resolve(node_root, 'lodash', 'dist', 'lodash.min.js'),
        // prevents using crossvent from dist and by that
        // reenables debugging in the browser console.
        // https://github.com/bevacqua/dragula/issues/102#issuecomment-123296868
        'crossvent': path.resolve(node_root, 'crossvent', 'src', 'crossvent.js')
      }, pluginAliases)
    },

    externals: {
      "I18n": "I18n"
    },

    plugins: [
      // Add a simple fail plugin to return a status code of 2 if
      // errors are detected (this includes TS warnings)
      // It is ONLY executed when `ENV[CI]` is set or `--bail` is used.
      TypeScriptDiscruptorPlugin,

      new webpack.DllReferencePlugin({
          context: path.resolve(__dirname),
          manifest: require('./dist/vendors-dll-manifest.json')
      }),

      // Extract CSS into its own bundle
      new ExtractTextPlugin({
        filename: 'openproject-[name].css',
        disable: false
      }),

      // Global variables provided in all entries
      // We should avoid this since it reduces webpack
      // strengths to discover dependency use.
      new webpack.ProvidePlugin({
        '_': 'lodash'
      }),

      // Restrict loaded ngLocale locales to the ones we load from translations
      new webpack.ContextReplacementPlugin(
        /(angular-i18n)/,
        new RegExp('angular-locale_(' + localeIds.join('|') + ')\.js$', 'i')
      )
    ]
  };

  if (uglify) {
    console.log("Applying webpack.optimize plugins for production.");
    // Add compression and optimization plugins
    // to the webpack build.
    config.plugins.push(
      new webpack.optimize.UglifyJsPlugin({
        mangle: false,
        compress: true,
        compressor: { warnings: false },
        sourceMap: false
      }),
      new webpack.LoaderOptionsPlugin({
        // Let loaders know that we're in minification mode
        minimize: true
      })
    );
  }

  return config;
}

module.exports = getWebpackMainConfig;
