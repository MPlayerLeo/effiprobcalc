// 基本策略仍然是"空壳"：不缓存 index.html、不拦截任何普通请求。
// 这个站是单文件、发布频繁，一旦真的缓存 index.html，用户很容易卡在旧版本上，
// 所以 install 时直接 skipWaiting，普通请求在 fetch 里原样放过，等于没有这个 service worker。
//
// 唯一的例外是 species_icons/{normal,shiny}/*.webp 这 491 张头像参考图（约4.5MB）：
// 它们是"截图识别"认物种的主信号，内容跟文件名绑死、基本不会变（加新宝可梦是加新文件，
// 不是改旧文件），而且第一次点识别要一口气全下完。只对这一类路径做 cache-first，
// 并在页面空闲时提前灌满，让"点识别 → 干等几MB"这一下彻底消失。
//
// ⚠️ 如果哪天是"替换"已有编号的参考图（换素材、换画风，而不是加新编号），
// 记得把 ICON_CACHE 的版本号 +1，否则老用户会一直吃缓存里的旧图。

var ICON_CACHE = 'species-icons-v1';
var ICON_RE = /\/species_icons\/(?:normal|shiny)\/[^\/]+\.webp$/;

function isIconUrl(u){
  return u.origin === self.location.origin && ICON_RE.test(u.pathname);
}

self.addEventListener('install', function(e){ self.skipWaiting(); });

self.addEventListener('activate', function(e){
  e.waitUntil(Promise.all([
    self.clients.claim(),
    // 换了版本号就把旧那桶整个删掉，别让废弃的参考图一直占着存储配额
    caches.keys().then(function(keys){
      return Promise.all(keys.map(function(k){
        return (k !== ICON_CACHE && k.indexOf('species-icons-') === 0) ? caches.delete(k) : null;
      }));
    }),
  ]));
});

self.addEventListener('fetch', function(e){
  if(e.request.method !== 'GET') return;
  var u;
  try{ u = new URL(e.request.url); }catch(err){ return; }
  if(!isIconUrl(u)) return;   // 头像参考图以外的一律不碰，照常走网络
  e.respondWith(
    caches.open(ICON_CACHE).then(function(c){
      return c.match(e.request).then(function(hit){
        if(hit) return hit;
        return fetch(e.request).then(function(res){
          // 缺素材的那几只（阿罗拉形态）会 404，别把 404 也存进去，否则以后补了图也修不好
          if(res && res.ok) c.put(e.request, res.clone());
          return res;
        });
      });
    })
  );
});

// 页面空闲时会把完整的头像 URL 列表 postMessage 过来。名单由页面从 POKEMON_DEX_DATA 现算，
// service worker 这边不重复维护一份——加新宝可梦时不需要动这个文件。
var precaching = false;
self.addEventListener('message', function(e){
  var d = e.data;
  if(!d || d.type !== 'precache-icons' || !Array.isArray(d.urls)) return;
  if(precaching) return;
  precaching = true;
  var done = function(){ precaching = false; };
  e.waitUntil(precacheIcons(d.urls).then(done, done));
});

function precacheIcons(urls){
  return caches.open(ICON_CACHE).then(function(c){
    var i = 0;
    function next(){
      if(i >= urls.length) return Promise.resolve();
      var url = urls[i++];
      return c.match(url).then(function(hit){
        if(hit) return;   // 已经有了就跳过，所以重复调用是廉价的
        return fetch(url, {credentials:'same-origin'}).then(function(res){
          if(res && res.ok) return c.put(url, res);
        })['catch'](function(){});   // 单张失败（404/掉线）不影响别的，下次进站再补
      }).then(next);
    }
    // 4 条并发：够快，又不至于跟用户当下真正在发的请求抢带宽
    var lanes = [];
    for(var k = 0; k < 4; k++) lanes.push(next());
    return Promise.all(lanes);
  });
}
