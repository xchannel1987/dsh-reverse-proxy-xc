> **实现说明**: 本文档是实施前的设计稿。实际实现已简化——lib/client.js 未单独实现（DSH 设置面板对注册的命名空间自动渲染表单），设置 schema 内联在 lib/index.js 而非独立 config.ts，依赖收敛为 schemastery + @deepseek-ai/dsh-settings。功能与设计一致。
# dsh-lan-proxy 璁捐鏂囨。

- **鏃ユ湡**: 2026-08-18
- **鐘舵€?*: 寰呭闃?- **鎻掍欢鍚?*: `dsh-lan-proxy`
- **绫诲瀷**: DSH Web profile 鎻掍欢锛坈ordis bundle锛夛紝閫氳繃 `dsh plugin --profile web add` 瀹夎

## 1. 鑳屾櫙涓庨棶棰?
鐢ㄦ埛鍦ㄧ數鑴戜笂杩愯 DeepSeek Harness锛圖SH锛塛eb GUI锛堥粯璁ょ洃鍚?`127.0.0.1:3080`锛夈€?- 鐢ㄦ埛閫氳繃 EasyConnect 鎺ュ叆鍏徃鍐呯綉锛屽叾浠栫數鑴戝彲璁块棶鏈満鍐呯綉 IP `10.100.50.125`銆?- DSH 鐨?`/api` 鏈変竴涓祻瑙堝櫒淇′换鏍呮爮锛?*鍙湁鍥炵幆锛坙oopback锛夋潵婧愮殑璇锋眰鎵嶆斁琛岀壒鏉冩柟娉?*锛坄settings.describe`銆乣credentials.describe`銆乣agentPreset.read` 绛夛級锛岄潪鍥炵幆鏉ユ簮涓€寰?403銆?- 鍥犳锛屽叾浠栫數鑴戠洿鎺ヨ闂?`10.100.50.125:3080` 鍙兘鐪嬪埌绌哄３ UI锛圚ome/闈炵壒鏉?API 鍙敤锛夛紝Sidebar / 璁剧疆 / 鍑嵁鍏ㄩ儴 403銆?
**宸叉湁楠岃瘉缁撹**锛氫竴涓妸璇锋眰杞彂鍒?`127.0.0.1:3080` 骞舵妸 `Host`/`Origin` 鏀瑰啓涓哄洖鐜殑浠ｇ悊锛屽彲浠ヨ DSH 璁や负璇锋眰鏉ヨ嚜鍥炵幆锛屼粠鑰?*鍏ㄩ儴鍔熻兘鍙敤锛堝惈鐗规潈鏂规硶锛?*銆傚綋鍓嶇敤鐙珛 Node 鑴氭湰 `proxy-3080.js` 瀹炵幇浜嗚繖涓€鐐癸紝杩愯鏃堕獙璇侀€氳繃锛圚TTP 200 鍏ㄧ鐐?+ WebSocket 101锛夈€?
## 2. 鐩爣

鎶?灞€鍩熺綉鍙嶄唬"浠庣嫭绔嬭剼鏈?*鍥哄寲鎴愪竴涓?DSH 瀹樻柟鎻掍欢**锛屽叿澶囷細
1. 閫氳繃 `dsh plugin --profile web add` 瀹夎锛堟爣鍑?bundle 鏈哄埗锛夈€?2. 鐙珛 http server 鐩戝惉鍙厤缃殑 IP 涓庣鍙ｏ紙**榛樿 `0.0.0.0:13080`**锛夛紝鎶婅姹傚弽浠ｅ埌涓?DSH锛坄127.0.0.1:3080`锛夛紝骞舵敼鍐?`Host`/`Origin`/`Referer` 涓哄洖鐜€?3. 鎻愪緵 DSH **璁剧疆闈㈡澘鑿滃崟**锛堝懡鍚嶇┖闂?`dsh-proxy`锛夛細
   - `enabled`锛堝竷灏旓紝**榛樿 `false`**鈥斺€斿畨瑁呮彃浠跺悗**涓嶈嚜鍔ㄥ惎鍔ㄥ弽浠?*锛屽繀椤荤敤鎴峰湪璁剧疆闈㈡澘鎵嬪姩寮€鍚級
   - `host`锛堝瓧绗︿覆锛岄粯璁?`0.0.0.0`锛?   - `port`锛堟暟瀛楋紝榛樿 `13080`锛?4. 鏀寔 WebSocket 鍗囩骇杞彂锛圖SH 鍓嶇渚濊禆 `/api/events.mux`銆乣/api/events.host`锛夈€?5. **涓嶅仛寮€鏈鸿嚜鍚?*锛堢敤鎴锋槑纭姹傦級锛涙彃浠堕殢 DSH 杩涚▼鐢熷懡鍛ㄦ湡杩愯銆?
## 3. 闈炵洰鏍囷紙YAGNI锛?
- 涓嶅仛 TLS/璁よ瘉锛堜笌 DSH 鐜扮姸涓€鑷达紱鏂囨。淇濈暀椋庨櫓鎻愮ず锛夈€?- 涓嶅仛涓?webServer 鐨?`host` 淇敼锛堜笉纰?127.0.0.1 涓荤粦瀹氾級銆?- 涓嶅仛鍏綉鏆撮湶/闅ч亾锛堝彧鏈嶅姟灞€鍩熺綉/Tailscale 鍙揪鐨勮澶囷級銆?- 涓嶅仛 Windows 鏈嶅姟/璁″垝浠诲姟锛堜笉瑕佸紑鏈鸿嚜鍚級銆?
## 4. 鏋舵瀯

```
鈹屸攢鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€ DSH web profile 杩涚▼ 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹?鈹?                                                            鈹?鈹? 涓?webServer (127.0.0.1:3080)  鈫愨攢 鐜版湁 DSH UI / API        鈹?鈹?     鈹斺攢鈹€ /api 璺敱锛堣繛鎺ユ彃浠舵墍鏈夛紝鍚俊浠绘爡鏍忥級                鈹?鈹?                                                            鈹?鈹? 銆愭柊澧炪€慸sh-lan-proxy 鎻掍欢 (bundle)                        鈹?鈹?     鈹斺攢鈹€ 鐙珛 http.Server锛堜粎褰?enabled=true 鏃剁洃鍚級        鈹?鈹?         鈫?榛樿 0.0.0.0:13080锛屽彲閰嶇疆                        鈹?鈹?          鈹溾攢 HTTP:  鏀瑰啓 Host/Origin/Referer 鈫?127.0.0.1:3080
鈹?          鈹溾攢 WS:    upgrade 杞彂锛堝悓鏀瑰啓锛?                  鈹?鈹?          鈹斺攢 璁剧疆: settingsNamespace('dsh-proxy')           鈹?鈹斺攢鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹?```

- 鎻掍欢**鑷缓绗簩涓?http server**锛堜笉鍗犵敤銆佷笉淇敼涓?webServer 鐨勭粦瀹氾級锛屽洜姝や笌涓?3080 瀹屽叏闅旂锛岀鍙ｅ啿绐侀闄╃嫭绔嬨€?- 鍙嶄唬閫昏緫涓庡凡楠岃瘉鐨?`proxy-3080.js` 鍚屾瀯锛堢敓浜у彲澶嶇敤鎵嬪啓瀹炵幇锛屾棤闇€寮曞叆棰濆渚濊禆锛夈€?
## 5. 缁勪欢涓庢枃浠?
```
D:\workspace\dsh-lan-proxy\
鈹溾攢鈹€ package.json          # name=dsh-lan-proxy, type=module, dsh.bundle.patch
鈹溾攢鈹€ cordis.patch.yml      # insert 鎻掍欢琛岋紙id: lan-proxy, name: dsh-lan-proxy锛?鈹溾攢鈹€ lib\
鈹?  鈹溾攢鈹€ index.js          # 鎻掍欢 apply(ctx, config)锛氳璁剧疆銆佽捣 server銆佹敞鍐岃矾鐢?鈹?  鈹溾攢鈹€ proxy.js          # 鍙嶄唬鏍稿績锛坆uildProxyHandler锛欻TTP+WS 鏀瑰啓杞彂锛?鈹?  鈹溾攢鈹€ config.ts         # schemastery schema锛坋nabled/host/port锛?鈹?  鈹斺攢鈹€ client.js         # 娴忚鍣ㄧ锛氳缃潰鏉?UI锛堣/鍐?dsh-proxy 鍛藉悕绌洪棿锛?鈹溾攢鈹€ docs\
鈹?  鈹斺攢鈹€ 2026-08-18-dsh-lan-proxy-design.md
鈹斺攢鈹€ README.md
```

### 5.1 `package.json` 鍏抽敭瀛楁

```json
{
  "name": "dsh-lan-proxy",
  "version": "0.1.0",
  "type": "module",
  "main": "lib/index.js",
  "dsh": {
    "bundle": { "patch": "./cordis.patch.yml" }
  },
  "peerDependencies": {
    "@deepseek-ai/cordis": "^4.0.0-rc.7",
    "@deepseek-ai/dsh-client-runtime": "^0.1.0-rc.6",
    "@deepseek-ai/dsh-client-web-react": "^0.1.0-rc.6",
    "@deepseek-ai/dsh-host-webserver": "^0.1.0-rc.6",
    "@deepseek-ai/dsh-settings": "^0.1.0-rc.6"
  }
}
```

渚濊禆 `@deepseek-ai/dsh-host-webserver` 涓昏涓?*绫诲瀷/鏈嶅姟濂戠害**锛圵ebServer 鏈嶅姟寮曠敤锛夛紝瀹為檯鍙嶄唬鐢?`node:http` 鑷缓 server锛屼笉娉ㄥ唽鍒颁富 webserver锛堥伩鍏嶅崰 3080 鐨勮矾鐢辫〃锛夈€?
### 5.2 `cordis.patch.yml`

```yaml
- insert:
    - id: lan-proxy
      name: 'dsh-lan-proxy'
```

鍙傜収 `dsh-better-sidebar` 鐨?bundle 閫氶亾锛堝畨瑁呭悗鑷姩鍏ユ爤锛屾棤闇€鏀?profile 鏂囦欢锛夈€?
### 5.3 璁剧疆鍛藉悕绌洪棿

娌跨敤 `dsh-better-sidebar` 鐨?`settingsNamespace(NS)` 妯″紡锛?
```ts
// lib/config.ts
import { settingsNamespace } from '@deepseek-ai/dsh-settings';
import { Schema } from '@deepseek-ai/schemastery';

const NS = 'dsh-proxy';
const ns = settingsNamespace(NS);
ns.schema({
  enabled: Schema.boolean().default(false),
  host: Schema.string().default('0.0.0.0'),
  port: Schema.number().min(1).max(65535).default(13080),
});
export { NS, ns };
```

- host 渚?`apply` 璇诲彇璇ュ懡鍚嶇┖闂达紱**`enabled=false`锛堥粯璁わ級鏃朵笉鐩戝惉浠讳綍绔彛**锛屽彧鏈夌敤鎴峰紑鍚悗鎵嶅缓绔嬪弽浠?server銆?- **璁剧疆鍙樻洿 鈫?鐑噸鍚洃鍚?*锛坉ispose 鏃?server 鈫?鎸夋柊鍊艰捣鏂扮殑锛涚粦瀹氬け璐ヤ粎鏃ュ織锛屼笉褰卞搷涓?DSH锛夈€傚叧闂?`enabled` 鍗冲仠姝㈢洃鍚€?
### 5.4 鍙嶄唬鏍稿績 `lib/proxy.js`

涓庡凡楠岃瘉鑴氭湰鍚屾瀯锛?
- `http.createServer` 鐩戝惉 `{host}:{port}`銆?- 姣忎釜璇锋眰锛?  - 鏋勯€犱笂娓歌姹傚埌 `127.0.0.1:3080`锛宍headers.host = '127.0.0.1:3080'`銆?  - 鏀瑰啓 `origin`锛堣嫢瀛樺湪锛夆啋 `http://127.0.0.1:3080`锛涙敼鍐?`referer`锛堣嫢瀛樺湪锛夆啋 鍚?host 鐨?URL銆?  - 閫忎紶 method/path/body锛涘搷搴旀祦寮忓洖浼犮€?  - 鏈嶅姟绔敊璇?鈫?502銆?- `server.on('upgrade')`锛歍CP 杩炲埌 `127.0.0.1:3080`锛屾敼鍐欏悗鐨勮姹傚ご鍙戣捣 upgrade 鎻℃墜锛屾垚鍔熷悗鍙屽悜 pipe锛堝凡楠岃瘉 101 + 鏁版嵁娴侊級銆?
### 5.5 瀹㈡埛绔缃?UI `lib/client.js`

鍙傜収 `dsh-better-sidebar` / DSH 瀹㈡埛绔彃浠舵満鍒讹細
- 閫氳繃瀹㈡埛绔繍琛屾椂锛坄@deepseek-ai/dsh-client-runtime`锛夋寕杞借繘娴忚鍣?roster銆?- 鍦?DSH 璁剧疆闈㈡澘娉ㄥ唽涓€涓?鍙嶅悜浠ｇ悊"鍒嗗尯锛歚enabled` 寮€鍏炽€乣host`銆乣port` 杈撳叆锛岃/鍐?`dsh-proxy` 鍛藉悕绌洪棿锛坰ettings RPC锛夈€?- 鏄剧ず褰撳墠鐩戝惉鐘舵€侊紙杩愯涓?澶辫触銆佸疄闄呯洃鍚湴鍧€锛夈€?
## 6. 鏁版嵁娴?
1. 鐢ㄦ埛锛堝叕鍙稿唴缃戝叾浠栫數鑴戯級璁块棶 `http://10.100.50.125:13080/`銆?2. 鎻掍欢 http server 鏀跺埌 鈫?鏀瑰啓 `Host/Origin/Referer` 鈫?杞彂 `127.0.0.1:3080`銆?3. DSH 瑙嗕綔鍥炵幆璇锋眰 鈫?棣栭〉 / API锛堝惈鐗规潈鏂规硶锛? WebSocket 鍏ㄩ€?鈫?**鏃?403**锛孲idebar/璁剧疆/鍑嵁鍙敤銆?4. 璁剧疆闈㈡澘淇敼 `port` 鈫?鍛藉悕绌洪棿鍐欏簱 鈫?鎻掍欢鐑噸鍚洃鍚?鈫?鐢ㄦ埛璁块棶鏂扮鍙ｃ€?
## 7. 閿欒澶勭悊

| 鍦烘櫙 | 琛屼负 |
|---|---|
| 绔彛琚崰鐢?/ 缁戝畾澶辫触 | console.warn + 鐘舵€佹爣璁?澶辫触"锛屼富 DSH 涓嶅彈褰卞搷锛涜缃潰鏉挎樉绀洪敊璇?|
| 涓婃父 DSH 鏈氨缁紙鍚姩绔炴€侊級 | 璇锋眰杩斿洖 502锛涜繛鎺ュ缓绔嬪悗鍗虫甯革紙鎻掍欢涓嶉樆濉?DSH 鍚姩锛?|
| 涓婃父杩炴帴涓柇 | 502锛屼笉宕╂簝 |
| 璁剧疆闈炴硶锛坧ort 瓒婄晫绛夛級 | schema 鏍￠獙鎷掔粷鍐欏叆锛岄潰鏉挎彁绀?|
| 鍙嶄唬 server 寮傚父 | catch + 鏃ュ織锛屼笉閫€鍑鸿繘绋?|

## 8. 瀹夊叏璇存槑

- 涓?DSH 鐜扮姸涓€鑷达細**鏃犺璇佸眰銆佹槑鏂?HTTP**銆傜粦瀹?`0.0.0.0` 鎰忓懗鐫€鎵€鏈夊彲杈炬湰鏈虹殑缃戠粶锛堝叕鍙稿唴缃戙€乀ailscale锛夐兘鑳借闂€?- **榛樿 `enabled=false`锛屽畨瑁呭悗涓嶆毚闇蹭换浣曠鍙?*锛涚敤鎴烽渶鍦ㄨ缃潰鏉挎樉寮忓紑鍚墠鐩戝惉 `0.0.0.0:13080`锛堝彲鏀圭粦鍒扮壒瀹氱綉鍗℃垨鍏抽棴锛夈€傛枃妗?README 涓槑纭闄┿€?- **涓嶅仛寮€鏈鸿嚜鍚?*锛涙彃浠堕殢 DSH 鐢熷懡鍛ㄦ湡锛孌SH 鍏抽棴鍒欑洃鍚仠姝紙涓庣敤鎴?涓嶈寮€鏈鸿嚜鍚?涓€鑷达級銆?
## 9. 娴嬭瘯璁″垝

1. **鍗曞厓**锛歚proxy.js` 鐨?Host/Origin/Referer 鏀瑰啓鍑芥暟锛堣緭鍏ヨ姹傚ご 鈫?鏂█杈撳嚭锛夈€?2. **闆嗘垚锛堟湰鏈猴級**锛?   - 璧?DSH锛?27.0.0.1:3080锛夛紝瑁呮彃浠讹紝璁块棶 `127.0.0.1:13080`锛氶椤?200銆乣/api/session.list` 200銆乣/api/settings.describe` 200銆乄S `/api/events.mux` 101銆?   - 浠?`10.100.50.125:13080` 璁块棶锛堟ā鎷熻繙绋嬶級锛氶獙璇佹棤 403銆佺壒鏉冩柟娉曞彲璇汇€?3. **璁剧疆**锛氬嚭鍘傞粯璁?`enabled=false`锛堣鎻掍欢鍚?*绔彛鏃犵洃鍚?*锛岄獙璇佸畨鍏ㄩ粯璁ゅ€硷級锛涢潰鏉垮紑鍚?鈫?鐩戝惉鍚姩锛涙敼 `port` 鈫?鐑噸鍚紱鏀?`enabled=false` 鈫?鐩戝惉鍋滄锛涙敼闈炴硶鍊?鈫?鎷掔粷銆?4. **鍥炲綊**锛氫富 DSH 3080 涓嶅彈鎻掍欢瀹夎褰卞搷锛堟湭瑁呮椂琛屼负涓€鑷达級銆?
## 10. 閲岀▼纰?
- M1: 椤圭洰楠ㄦ灦 + 鍙畨瑁?bundle锛堟渶灏忓弽浠ｏ紝`enabled` 榛樿 false 涓嶇洃鍚紝楠岃瘉鎻掍欢鏈哄埗閫氾級銆?- M2: 璁剧疆鍛藉悕绌洪棿 + 璁剧疆闈㈡澘 UI + 鐑噸鍚€?- M3: 瀹屾暣娴嬭瘯 + README + 瀹夎鏂囨。銆?
## 11. 鍏抽敭瀹炵幇鍐崇瓥锛堝疄鐜板墠纭锛?
### 11.1 鎻掍欢鍛藉悕绌洪棿 vs 鐩存帴閰嶇疆
- **閫夋嫨**锛歚settingsNamespace('dsh-proxy')`锛堢敤鎴峰彲鏀圭殑杩愯鏈熻缃級
- **澶囬€?*锛歚cordis.patch.yml` 閲屽啓姝?config锛坄config: {host, port}`锛夛紝涓嶅彲鍦ㄩ潰鏉挎敼
- **鐞嗙敱**锛氱敤鎴锋槑纭姹?璁剧疆椤甸潰澧炲姞鑿滃崟"锛岄潰鏉垮彲璋冩洿绗﹀悎璇夋眰銆?
### 11.2 鍙嶄唬 server 鐨勫綊灞?- **閫夋嫨**锛氭彃浠惰嚜寤?`node:http` server锛堜笉娉ㄥ唽鍒颁富 webServer 鐨勮矾鐢辫〃锛?- **澶囬€?*锛氬湪 `0.0.0.0:13080` 涓婄敤涓?webServer锛堥渶鏀逛富缁戝畾锛岄闄╅珮锛?- **鐞嗙敱**锛氫富 webServer 鍙敮鎸?`127.0.0.1` 鎴?`0.0.0.0` 鍗曠粦瀹氾紝鏀瑰畠浼氬奖鍝?3080 涓荤晫闈紱鑷缓鐙珛 server 闅旂銆佸彲鐑噸鍚€佷笉褰卞搷 3080銆?
### 11.3 绔彛榛樿鍊?- **閫夋嫨**锛歚13080`锛堝凡纭锛夛紝閬垮厤涓?3080 鍐茬獊銆?
### 11.4 瀹夎涓庣敓鍛藉懆鏈?- 鐢ㄦ埛瑕佹眰璧?**`dsh plugin --profile web add dsh-lan-proxy`**锛坆undle 閫氶亾锛夈€?- **涓嶅仛寮€鏈鸿嚜鍚?*锛屼笉娉ㄥ唽 Windows 鏈嶅姟/璁″垝浠诲姟锛涙彃浠堕殢 DSH 杩涚▼杩愯銆
