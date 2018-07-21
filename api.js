const fs = require("fs");
const micro = require("micro");
const axios = require("axios");
const pify = require("pify");
const glob = pify(require("glob"));
const marked = require("marked");
const highlightjs = require("highlight.js");
const fm = require("front-matter");
const { resolve } = require("path");
const readFile = pify(fs.readFile);
const send = micro.send;

//Fetch docs
let _DOC_FILES_ = {};
let _DOC_FILES_LIST = [];
async function getFiles(cwd) {
  console.log("Building files...");
  cwd = cwd || process.cwd();
  let docPaths = await glob("*/**/*.md", {
    cwd: cwd,
    ignore: "node_modules/**/*",
    nodir: true
  });
  let promises = [];
  let tmpDocFiles = {};
  docPaths.forEach((path) => {
    let promise = getDocFile(path, cwd);
    promise.then(file => {
      tmpDocFiles[path] = file;
    });
    promises.push(promise);
  });
  await Promise.all(promises);
  _DOC_FILES_ = tmpDocFiles
}

async function getDocFile(path, cwd) {
  cwd = cwd || process.cwd();
  let file = await readFile(resolve(cwd, path), "utf-8");
  _DOC_FILES_LIST.push(path.slice(path.lastIndexOf("/") + 1))
  file = fm(file);
  _DOC_FILES_[path] = {
    attrs: file.attributes,
    body: marked(file.body)
  };
  return _DOC_FILES_[path]
}

// watch file chanegs
function watchFiles() {
    console.log("Watch files changes...");
    const options = {
      ignoreInitial: "true",
      ignored: "node_modules/**/*"
    };
    const chokidar = require("chokidar");
    // Doc Pages
    chokidar
      .watch("*/**/*.md", options)
      .on("add", path => getDocFile(path))
      .on("change", path => getDocFile(path))
      .on("unlink", path => delete _DOC_FILES_[path]);
}

// Server handle request method
const server = micro(async function(req, res) {
  // If github hook
  if (req.method === "POST" && req.url === "/hook") {
    try {
      return await githubHook({ req, res }, getFiles);
    } catch (e) {
      console.error("Error!");
      console.error(e);
    }
  }
  //跨域访问
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  // Releases
  if (req.url === '/releases') {
    return send(res, 200, RELEASES)
  }
  if (req.url === '/arts') {
    return send(res, 200, {'data':_DOC_FILES_LIST, 'code':1})
  }
  let path = req.url.slice(1) + '.md'
  if (!_DOC_FILES_[path]) {
      return send(res, 404, 'File not found')
  }

  send(res, 200, _DOC_FILES_[path])
});




module.exports = getFiles().then(() => {
    const port = process.env.PORT || 4000
    server.listen(port)
    console.log(`Server listening on localhost:${port}`)
    return server
});
