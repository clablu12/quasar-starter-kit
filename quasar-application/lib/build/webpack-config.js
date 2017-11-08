const
  chalk = require('chalk'),
  path = require('path'),
  webpack = require('webpack'),
  ProgressBarPlugin = require('progress-bar-webpack-plugin'),
  HtmlWebpackPlugin = require('html-webpack-plugin')

const
  appPaths = require('../app-paths'),
  cssUtils = require('./get-css-utils')

function appResolve (dir) {
  return path.join(appPaths.appDir, dir)
}
function srcResolve (dir) {
  return path.join(appPaths.srcDir, dir)
}
function cliResolve (dir) {
  return path.join(appPaths.cliDir, dir)
}

module.exports = function (cfg) {
  let webpackConfig = {
    entry: {
      app: [ appPaths.entryFile ]
    },
    devtool: cfg.build.sourceMap ? cfg.build.devtool : false,
    resolve: {
      extensions: [
        '.js', '.vue', '.json'
      ],
      modules: [
        appResolve('node_modules'),
        cliResolve('node_modules')
      ],
      alias: {
        quasar: cliResolve(`node_modules/quasar-framework/dist/quasar.${cfg.ctx.themeName}.esm.js`),
        'quasar-styl': cliResolve(`node_modules/quasar-framework/dist/quasar.${cfg.ctx.themeName}.styl`),
        variables: srcResolve(`themes/app.variables.styl`),
        '~': appPaths.srcDir,
        '@': srcResolve(`components`),
        layouts: srcResolve(`layouts`),
        pages: srcResolve(`pages`),
        assets: srcResolve(`assets`)
      }
    },
    resolveLoader: {
      modules: [
        appResolve('node_modules'),
        cliResolve('node_modules')
      ]
    },
    module: {
      rules: [
        {
          test: /\.vue$/,
          loader: 'vue-loader',
          options: {
            loaders: cssUtils.cssLoaders({
              sourceMap: cfg.build.sourceMap,
              extract: cfg.build.extractCSS,
              minimize: cfg.build.minify
            }),
            transformToRequire: {
              video: 'src',
              source: 'src',
              img: 'src',
              image: 'xlink:href'
            }
          }
        },
        {
          test: /\.js$/,
          loader: 'babel-loader',
          include: [
            appPaths.srcDir,
            appPaths.entryFile
          ]
        },
        {
          test: /\.json$/,
          loader: 'json-loader'
        },
        {
          test: /\.(png|jpe?g|gif|svg)(\?.*)?$/,
          loader: 'url-loader',
          options: {
            limit: 10000,
            name: 'img/[name].[hash:7].[ext]'
          }
        },
        {
          test: /\.(woff2?|eot|ttf|otf)(\?.*)?$/,
          loader: 'url-loader',
          options: {
            limit: 10000,
            name: 'fonts/[name].[hash:7].[ext]'
          }
        },
        {
          test: /\.(mp4|webm|ogg|mp3|wav|flac|aac)(\?.*)?$/,
          loader: 'url-loader',
          options: {
            limit: 10000,
            name: 'media/[name].[hash:7].[ext]'
          }
        }
      ]
    },
    plugins: [
      new webpack.DefinePlugin({
        'process.env': cfg.build.env
      }),
      new ProgressBarPlugin({
        format: ` [:bar] ${chalk.bold(':percent')} (:msg)`
      })
    ],
    performance: {
      hints: false
    }
  }

  // inject CSS loaders for outside of .vue
  webpackConfig.module.rules = webpackConfig.module.rules.concat(
    cssUtils.styleLoaders({
      sourceMap: cfg.build.sourceMap,
      extract: cfg.build.extractCSS,
      minimize: cfg.build.minify
    })
  )

  // DEVELOPMENT build
  if (cfg.ctx.dev) {
    const FriendlyErrorsPlugin = require('friendly-errors-webpack-plugin')

    webpackConfig.plugins.push(
      new webpack.NoEmitOnErrorsPlugin()
    )
    webpackConfig.plugins.push(
      new FriendlyErrorsPlugin({
        compilationSuccessInfo: {
          messages: [`App is running at ${cfg.build.uri}\n`],
        },
        clearConsole: true
      })
    )

    // generate html file
    webpackConfig.plugins.push(
      // https://github.com/ampedandwired/html-webpack-plugin
      new HtmlWebpackPlugin({
        filename: 'index.html',
        template: srcResolve(`index.template.html`),
        inject: true
      })
    )

    if (cfg.devServer.hot) {
      require('webpack-dev-server').addDevServerEntrypoints(webpackConfig, cfg.devServer)
      webpackConfig.plugins.push(new webpack.NamedModulesPlugin()) // HMR shows filenames in console on update
      webpackConfig.plugins.push(new webpack.HotModuleReplacementPlugin())
    }
  }
  // PRODUCTION build
  else {
    const CopyWebpackPlugin = require('copy-webpack-plugin')

    const
      vendorAdd = cfg.vendor && cfg.vendor.add ? cfg.vendor.add.filter(v => v) : false,
      vendorRemove = cfg.vendor && cfg.vendor.remove ? cfg.vendor.remove.filter(v => v) : false

    // generate dist files
    webpackConfig.output = {
      path: appResolve(cfg.build.distDir),
      publicPath: cfg.build.publicPath,
      filename: `js/[name]${cfg.build.webpackManifest ? '' : '.[chunkhash]'}.js`,
      chunkFilename: 'js/[id].[chunkhash].js'
    }

    // generate html file
    webpackConfig.plugins.push(
      new HtmlWebpackPlugin({
        filename: path.join(appResolve(cfg.build.distDir), cfg.build.htmlFilename),
        template: srcResolve(`index.template.html`),
        minify: cfg.build.minify
          ? {
            removeComments: true,
            collapseWhitespace: true,
            removeAttributeQuotes: true
            // more options:
            // https://github.com/kangax/html-minifier#options-quick-reference
          }
          : undefined,
        inject: true,
        // necessary to consistently work with multiple chunks via CommonsChunkPlugin
        chunksSortMode: 'dependency'
      })
    )

    // keep module.id stable when vender modules does not change
    webpackConfig.plugins.push(
      new webpack.HashedModuleIdsPlugin()
    )

    // split vendor js into its own file
    webpackConfig.plugins.push(
      new webpack.optimize.CommonsChunkPlugin({
        name: 'vendor',
        minChunks (module) {
          if (vendorAdd && module.resource && vendorAdd.some(v => module.resource.indexOf(v) > -1)) {
            return true
          }
          if (vendorRemove && module.resource && vendorRemove.some(v => module.resource.indexOf(v) > -1)) {
            return false
          }
          // A module is extracted into the vendor chunk when...
          return (
            // It's a JS file
            /\.js$/.test(module.resource) &&
            (
              // If it's inside node_modules
              /node_modules/.test(module.context) ||
              // or it's Quasar internals (while developing)
              /\/quasar\//.test(module.resource)
            )
          )
        }
      })
    )

    // extract webpack runtime and module manifest to its own file in order to
    // prevent vendor hash = require(being updated whenever app bundle is updated
    if (cfg.build.webpackManifest) {
      webpackConfig.plugins.push(
        new webpack.optimize.CommonsChunkPlugin({
          name: 'manifest',
          chunks: ['vendor']
        })
      )
    }

    // copy statics to dist folder
    webpackConfig.plugins.push(
      new CopyWebpackPlugin([
        {
          from: srcResolve(`statics`),
          to: path.join(appResolve(cfg.build.distDir), 'statics'),
          ignore: ['.*']
        }
      ])
    )

    // Scope hoisting ala Rollupjs
    // https://webpack.js.org/plugins/module-concatenation-plugin/
    if (cfg.build.scopeHoisting) {
      webpackConfig.plugins.push(new webpack.optimize.ModuleConcatenationPlugin())
    }

    if (cfg.build.minify) {
      const UglifyJSPlugin = require('uglifyjs-webpack-plugin')

      webpackConfig.plugins.push(
        new UglifyJSPlugin({
          parallel: true,
          sourceMap: cfg.build.sourceMap
        })
      )
    }

    // configure CSS extraction & optimize
    if (cfg.build.extractCSS) {
      const ExtractTextPlugin = require('extract-text-webpack-plugin')

      // extract css into its own file
      webpackConfig.plugins.push(
        new ExtractTextPlugin({
          filename: '[name].[contenthash].css'
        })
      )

      // dedupe CSS & minimize only if minifying
      if (cfg.build.minify) {
        const OptimizeCSSPlugin = require('optimize-css-assets-webpack-plugin')

        webpackConfig.plugins.push(
          // Compress extracted CSS. We are using this plugin so that possible
          // duplicated CSS = require(different components) can be deduped.
          new OptimizeCSSPlugin({
            cssProcessorOptions: cfg.build.sourceMap
              ? { safe: true, map: { inline: false } }
              : { safe: true }
          })
        )
      }
    }

    // also produce a gzipped version
    if (cfg.build.gzip) {
      const CompressionWebpackPlugin = require('compression-webpack-plugin')

      webpackConfig.plugins.push(
        new CompressionWebpackPlugin(cfg.build.gzip)
      )
    }

    if (cfg.build.analyze) {
      const BundleAnalyzerPlugin = require('webpack-bundle-analyzer').BundleAnalyzerPlugin
      webpackConfig.plugins.push(new BundleAnalyzerPlugin(Object.assign({}, cfg.build.analyze)))
    }
  }

  return webpackConfig
}