
var gulp = require('gulp'),
	jshint = require('gulp-jshint'),
	browserify = require('browserify'),
	source = require('vinyl-source-stream'),
	buffer = require('vinyl-buffer'),
	uglify = require('gulp-uglify'),
	rename = require('gulp-rename');

var packName = 'gifuct-js';

gulp.task('lint', function(){
	return gulp.src('./src/**/*.js')
		.pipe(jshint())
		.pipe(jshint.reporter('default'));
});

gulp.task('default', ['lint'], function(){
	
	var b = browserify({
		entries: './src/exports.js',
		debug: true
	});

	return b.bundle()
		.pipe(source(packName + '.js'))
		.pipe(gulp.dest('./dist/'))
		.pipe(buffer())
		.pipe(uglify())
		.pipe(rename(packName + '.min.js'))
		.pipe(gulp.dest('./dist/'));
});
