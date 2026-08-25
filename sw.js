// 空壳 service worker：只是为了满足安卓/Chrome"可安装"的技术门槛（要求有一个注册了
// fetch 事件的 service worker），不做任何缓存、不拦截任何请求——全部照常走网络。
// 这个站是单文件、发布频繁，一旦真的缓存 index.html，用户很容易卡在旧版本上，
// 所以这里 install 时直接 skipWaiting，fetch 里什么也不做，等于没有这个 service worker。
self.addEventListener('install', function(e){ self.skipWaiting(); });
self.addEventListener('activate', function(e){ e.waitUntil(self.clients.claim()); });
self.addEventListener('fetch', function(e){});
