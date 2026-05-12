// 自动 add + commit（先等 add 完成，再判断是否有可提交内容）
import { execSync } from 'node:child_process'

const opts = { stdio: 'inherit', cwd: process.cwd() }

execSync('git add .', opts)

const staged = execSync('git diff --cached --name-only', {
  encoding: 'utf8',
  cwd: process.cwd(),
}).trim()

if (!staged) {
  console.log('没有可提交的暂存变更，已跳过 commit')
  process.exit(0)
}

execSync('git commit -m "auto commit"', opts)
