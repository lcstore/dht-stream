var dragDrop = require('drag-drop')
var WebTorrent = require('webtorrent')
var createTorrent = require('create-torrent')
var http = require('http')
var querystring = require('querystring')
var util = require('./utils')

var client = new WebTorrent({
	maxConns: 5
})

var $uploadCount = document.querySelector('#upload-count')
var $uploadLog = document.querySelector('#upload-log')
var $shareTarget = document.querySelector('#video-share-target')
client.on('error', function (err) { 
	if(err.message && err.message.indexOf('duplicate torrent') > 0) {
		$uploadLog.innerHTML = '已上传过'
	} else {
		console.error("error",err)
	}
})
client.on('warning', function (err) { console.warn("warn",err) })
dragDrop('.video-share-box', processFiles)
selectUpload('.video-upload', processFiles)

var torrentSet = {}
function processFiles(files){
  var videoFiles;
  if (files) {
  	  videoFiles = Array.from(files).filter(function (file) {
	    return /(mp4|rmvb|mkv|avi)$/gi.test(file.name)
	  })
  }
  if(!videoFiles || videoFiles.length < 1) {
  	$uploadLog.innerHTML = '欢迎上传'
  	return
  }
  var opts = {
  	createdBy : '狸猫资讯lezomao.com'
  }
  client.seedTo(videoFiles, opts, function (torrent, err) {
  	   if (err) {
	  	   if(err.message && err.message.indexOf('duplicate torrent') > 0) {
			 $uploadLog.innerHTML = '已上传过'
	  	   }
	  	   return
	   }
  	   console.log('hash:'+torrent.infoHash+',Client is seeding ' + torrent.magnetURI)
  	   console.log('instant:'+torrent.torrentFileBlobURL)
  	   console.log('createdBy:'+torrent['created by'])
  	  if (torrentSet[torrent.infoHash]) {
  	  	$uploadLog.innerHTML = '已上传过'
  	  	return
  	  }
	  var params = {}
	  params.link = 'magnet:?xt=urn:btih:' + torrent.infoHash.toLowerCase()
	  params.title = torrent.files[0].name
	  params.space = torrent.length
	  console.log('params:',params);
	  postTorrent(params, function(resp){
	  	  console.log('post.response:',resp);
	  	  if(!resp || !resp.data || resp.code != 200 ) {
	  	  	 torrent.destroy()
	  	  	 $uploadLog.innerHTML = '上传失败'
	  	  	 return
	  	  } else {
	  	  	 var sumCount = 0;
		     if($uploadCount.innerHTML && !isNaN($uploadCount.innerHTML)) {
		     	 sumCount = $uploadCount.innerHTML.trim() - 0
		     }
		     sumCount = sumCount + torrent.files.length
		     $uploadCount.innerHTML = '' + sumCount
			 $uploadLog.innerHTML = '上传成功'
			 $shareTarget.innerHTML = '<a href="/movie/torrent/'+resp.data.id+'.html" target="_blank">'+params.title+'</a>'
			 torrentSet[torrent.infoHash] = 1
			 torrent.destroy()

	  	  }
	  	  
	  })
  })
}
function postTorrent(params,cb) {
	var sContent = JSON.stringify(params)
	var options = {  
	   path: '/api/movie/upload.json' ,  
	   method: 'POST',
	   headers:{
	   	  'Content-Type':'application/json',
	   	  'Content-Length':sContent.length
	   }     
	};  
	// 处理响应的回调函数  
	var callback = function(response){  
	   var body = '';  
	   response.on('data', function(data) {  
	      body += data;  
	   });  
	   response.on('end', function() {  
	      cb(JSON.parse(body));  
	   });  
	}  
	var req = http.request(options, callback);  
	req.write(sContent);  
	req.end();  
}
function selectUpload(selector,processFiles) {
	var $browse = document.querySelector(selector)
	var fileDialog = document.createElement("INPUT");
	fileDialog.setAttribute("type", "file");
	fileDialog.setAttribute("multiple", "true");
	fileDialog.type = "file";
	fileDialog.accept = "video/*";
	fileDialog.style.display = "none";
	$browse.addEventListener("click", function(){    
	    fileDialog.click();
	});
	fileDialog.addEventListener("change", function(){
	    processFiles(fileDialog.files);
	})
}