'use strict';
const gulp = require('gulp');
const mocha = require('gulp-mocha');
const eslint = require('gulp-eslint');
const webpack = require('webpack-stream');
const webpackConfig = require('./webpack.config.js');


gulp.task('default', ['test', 'lint'], () => runWebpackBuild());

gulp.task('lint', () =>
  gulp.src('./lib/*.js')
    .pipe(eslint())
    .pipe(eslint.format())
    .pipe(eslint.failAfterError())
);

gulp.task('test', () =>
  gulp.src('test/test-*.js', { read: false })
    .pipe(mocha())
);


function runWebpackBuild() {
  return gulp.src('./lib/entry-point.js')
    .pipe(webpack(webpackConfig))
    .pipe(gulp.dest('./'));
}
