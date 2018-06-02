var source = require('vinyl-source-stream');
var streamify = require('gulp-streamify');
var browserify = require('browserify');
// var uglify = require('gulp-uglify');
var gulp = require('gulp');
var uglify = require('gulp-uglify-es').default;

gulp.task('browserify', function() {
	browserify('index.js')
	    .bundle()
	    .pipe(source('stream.js'))
	    .pipe(streamify(uglify()))
	    .pipe(gulp.dest('./dist'));
});