/* 临时验证脚本：逐字稿快路径 + 后台翻译（用完即删） */
const { app } = require('electron')
const t = require('d:/AIPROJECT/bokeForYou/.tmp-t.cjs')

const root = process.env.APPDATA + '\\EchoPod'

const store = {
  root,
  subsDir: root + '\\subs',
  transcriptsDir: root + '\\transcripts',
  getSettings: () => ({ proxyMode: 'manual', proxy: 'http://127.0.0.1:1082', cookieFile: '', autoTranslate: true }),
  requestArgs: async () => ['--proxy', 'http://127.0.0.1:1082']
}

const episode = {
  id: '7ARBJQn6QkM',
  title: "NVIDIA CEO Jensen Huang's Vision for the Future",
  channel: 'Cleo Abram',
  duration: 3783,
  thumbnail: '',
  url: 'https://www.youtube.com/watch?v=7ARBJQn6QkM',
  publishedAt: null,
  viewCount: null,
  fileName: '7ARBJQn6QkM.m4a',
  coverName: null,
  size: 0,
  format: 'm4a',
  downloadedAt: 0,
  favorite: false,
  playCount: 0,
  lastPlayedAt: null,
  category: 'english-learning',
  progress: 0,
  completed: false
}

app.whenReady().then(async () => {
  try {
    const t0 = Date.now()
    const quick = await t.fetchTranscript(episode, store, false, false)
    console.log('JS_QUICK lines=' + quick.lines.length + ' note=' + (quick.note || '-') + ' ms=' + (Date.now() - t0))

    const t1 = Date.now()
    const full = await t.translateTranscript(episode, store)
    console.log('JS_TRANSLATE translated=' + Boolean(full && full.translated) + ' ms=' + (Date.now() - t1))
    if (full) {
      console.log('JS_SAMPLE=' + JSON.stringify(full.lines.slice(0, 2)))
      const done = full.lines.filter((l) => l.translation).length
      console.log('JS_COVERAGE translated_lines=' + done + '/' + full.lines.length)
    }
  } catch (err) {
    console.log('JS_ERROR ' + (err && err.message))
  }
  app.quit()
})
