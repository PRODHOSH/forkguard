import { p, h2, h3, code, out, ul, ol, table, note, warn, tip, dl, flow, brand, path, tasks } from '../lib.mjs';

export const start = [
  {
    slug: '',
    group: 'Start',
    title: 'Documentation',
    nav: 'Overview',
    description: 'forkguard finds malware hidden in repos before you install or run them, cleans it up and opens the pull request. Full documentation: every command, option, rule and guide.',
    lede: 'Catch malware hidden in a repo before you install or run it. Check a folder, a GitHub link or every repo you own, then clean what it finds and open a pull request.',
    blocks: [
      code('npx forkguard'),
      p('No install needed: `npx` runs it once. You need [Node.js](https://nodejs.org) 18 or newer and git. If it prints a list, something is wrong. If it prints one green line, you are fine.'),

      h2('Start here'),
      p('New to forkguard? Follow these four steps in order. Each one is a few minutes.'),
      path(
        ['Install it', 'One command. Needs Node.js 18+ and git.', 'page:install'],
        ['Check a project', 'Your first check, and how to read the result.', 'page:quick-start'],
        ['Clean it', 'Remove what it found and get your original files back.', 'page:commands/fix'],
        ['Stay protected', 'Check automatically before every npm install, for good.', 'page:guides/automatic-protection'],
      ),

      h2('I want to…'),
      p('Already know what you need? Jump straight to it.'),
      tasks(
        ['Check a repo before I clone it', 'Coding tests, recruiter repos, anything unknown.', 'page:guides/before-you-clone'],
        ['Check all my repos on GitHub', 'One command, every branch.', 'page:commands/mine'],
        ['Clean an infected project', 'What to do, in order.', 'page:guides/cleaning'],
        ['Fix it on GitHub', 'Open a pull request with the fix.', 'page:commands/pr'],
        ['Check every push', 'Add the GitHub Action.', 'page:guides/github-action'],
        ['Protect my AI agent', 'Rules for Claude Code, Cursor, Copilot, Codex.', 'page:guides/ai-agents'],
        ['Understand a message', 'What each line of the output means.', 'page:guides/read-results'],
        ['See every rule', 'Everything forkguard looks for.', 'page:reference/rules'],
        ['Use it in a script', 'JSON output and exit codes.', 'page:reference/json'],
        ['Fix a problem', 'Troubleshooting and FAQ.', 'page:guides/troubleshooting'],
      ),

      h2('Every command'),
      table(['Command', 'What it does', 'Changes anything?'], [
        ['[`forkguard`](page:commands/check)', 'Checks the current folder, or another one', 'No'],
        ['[`forkguard owner/repo`](page:commands/check-repo)', 'Checks a GitHub repo, every branch, without downloading its files', 'No'],
        ['[`forkguard --mine`](page:commands/mine)', 'Checks every repo you own on GitHub', 'No'],
        ['[`forkguard fix`](page:commands/fix)', 'Removes what it found, on your computer', 'Yes, your files'],
        ['[`forkguard pr`](page:commands/pr)', 'Removes it on a new branch and opens a pull request', 'Yes, a branch and a pull request'],
        ['[`forkguard setup`](page:commands/setup)', 'Checks automatically before npm install and after git clone', 'Yes, your shell profile'],
        ['[`forkguard agent`](page:commands/agent)', 'Safety rules for AI coding agents (next release)', 'Only with `--write`'],
      ]),
      p('Only `fix`, `pr`, `setup` and `agent --write` ever change anything. Checking is always read only.'),

      h2('What forkguard does'),
      p('Some malware hides inside ordinary looking repositories. The code sits after hundreds of blank spaces at the end of a normal line, so your editor shows nothing. It rewrites your latest commit, keeping the author, date and message, so git shows nothing either. The moment you open the folder in VS Code, or run `npm install` or `npm run dev`, it runs, steals tokens and keys, and spreads to every repo you can push to.'),
      p('forkguard looks for every trick this malware uses, **before** anything runs. It never runs code from the project it checks, and it never uploads your code anywhere.'),
      ul(
        '**Zero dependencies.** A tool you run before `npm install` should not need `npm install`.',
        '**Cross platform.** Windows, macOS and Linux, with PowerShell, Git Bash, bash and zsh.',
        '**Private.** No account and no telemetry. The only network calls are downloading a repo you asked it to check, and talking to GitHub for `forkguard pr` and `--mine`.',
        '**Free and open source.** MIT licensed. [Source on GitHub](https://github.com/PRODHOSH/forkguard).',
      ),

      h2('How these pages work'),
      p('Each command page is laid out like a manual page, with the sections Name, Synopsis, Description and so on. Every section is written twice:'),
      table(['Switch', 'You see'], [
        ['**Off** (the default)', 'Plain words, with examples and sample output. Start here.'],
        ['**On**, “Less comfortable”', 'The short reference text you would find in a real manual page.'],
      ]),
      p('Flip the switch on a section to change just that section, or use the switch in the header to change the whole page. Your choice is remembered.'),
      note('Search is on every page. Press `/` or `Ctrl K` (`⌘ K` on a Mac).'),
    ],
  },

  {
    slug: 'install',
    group: 'Start',
    title: 'Install',
    nav: 'Install',
    description: 'Install forkguard with npm, try it once with npx, update it and remove it. Requirements for Windows, macOS and Linux.',
    lede: 'One global install gives you the forkguard command in every folder.',
    blocks: [
      h2('Requirements'),
      ul('**Node.js 18 or newer.** Get it from [nodejs.org](https://nodejs.org).', '**git.** Get it from [git-scm.com](https://git-scm.com).'),
      p('Check you have both:'),
      code('node --version\ngit --version'),
      p('Two features need a little more. `forkguard pr` and `forkguard --mine` talk to GitHub, so they need the [GitHub CLI](https://cli.github.com) logged in (`gh auth login`) or a `GITHUB_TOKEN` environment variable.'),

      h2('Install'),
      code('npm install -g forkguard'),
      p('The `-g` means global: you can now type `forkguard` in any folder. Check it worked:'),
      code('forkguard --version'),
      tip('“forkguard is not recognized” or “command not found” right after installing? Close the terminal and open a new one.'),

      h2('Or try it once'),
      p('Put `npx` in front of any command. Nothing is installed:'),
      code('npx forkguard\nnpx forkguard someone/their-repo'),
      p('You do need the global install for [automatic protection](page:guides/automatic-protection), because your shell has to be able to find `forkguard`.'),

      h2('Update'),
      code('npm update -g forkguard'),
      p('Check what you have with `forkguard --version`. The newest version is on [npm](https://www.npmjs.com/package/forkguard), and every release is listed on the [releases page](https://github.com/PRODHOSH/forkguard/releases).'),

      h2('Remove'),
      p('If you turned on automatic protection, turn it off first so the hook comes out of your shell profile:'),
      code('forkguard setup --remove\nnpm uninstall -g forkguard'),
      p('Open a new terminal afterwards.'),

      h2('Platform notes'),
      table(['Platform', 'Notes'], [
        ['Windows', 'Works in PowerShell, PowerShell 7 and Git Bash. `forkguard setup` writes the hook to each profile it finds.'],
        ['macOS', 'Works in zsh and bash. `forkguard setup` writes to `~/.zshrc` and `~/.bashrc`.'],
        ['Linux', 'Works in bash and zsh, same files as macOS.'],
      ]),
      p('Tested in CI on Linux, Windows and macOS, on Node 18, 20 and 22.'),
    ],
  },

  {
    slug: 'quick-start',
    group: 'Start',
    title: 'Quick start',
    nav: 'Quick start',
    description: 'Your first forkguard check in two minutes: check a project, read the result, clean it, open a pull request and turn on automatic protection.',
    lede: 'From zero to protected in five steps.',
    blocks: [
      h2('1. Check the project you are in'),
      p('Open a terminal inside the project folder and run:'),
      code('forkguard'),
      p('A clean project looks like this:'),
      out('forkguard  my-app looks clean (433 files checked)'),
      tip('For your own repos, run `git pull` first. This malware gets into GitHub, not your laptop, so your local copy can look clean while GitHub has the infected version.'),

      h2('2. Read the result'),
      p('If something is wrong you get a list. Each line has a level, a file and a message:'),
      out('forkguard  my-app\n\n  HIGH  init                Code hidden after 776 blank spaces on line 35\n  HIGH  package.json        "dev" runs a hidden file called init before your real command\n  MED   .gitignore          Hides config.bat, a file this malware drops\n\n  3 problems found. Do not run npm install, npm run dev or open this folder in VS Code yet.\n  Run forkguard fix to clean it, or forkguard pr to clean it and open a pull request.'),
      table(['Level', 'Meaning', 'What to do'], [
        ['HIGH', 'Dangerous. It can run by itself and steal from you.', 'Do not install, run or open the project. Clean it first.'],
        ['MED', 'Worth a look. It does not run by itself.', 'Read it and decide. Most can be fixed with `forkguard fix`.'],
      ]),
      p('More in [Reading the results](page:guides/read-results).'),

      h2('3. Clean it'),
      code('forkguard fix'),
      out('forkguard  cleaning my-app\n\n  done  init                deleted\n  done  package.json        cleaned\n  done  postcss.config.mjs  restored your original from git history\n\n  Clean now. Review with "git diff", then commit.'),
      p('Look at what changed, then save it:'),
      code('git diff\ngit add -A\ngit commit -m "Remove injected malware"'),

      h2('4. Fix it on GitHub too'),
      p('`forkguard fix` cleans your computer. `forkguard pr` cleans **GitHub** as well, by opening a pull request with the fix:'),
      code('gh auth login\nforkguard pr'),
      p('Commit or stash your own changes first. Details in [`forkguard pr`](page:commands/pr).'),

      h2('5. Turn on automatic protection'),
      code('npm install -g forkguard\nforkguard setup'),
      p('Close the terminal and open a new one. From now on forkguard checks a project before `npm install`, `npm run dev` and friends, and after `git clone`. When everything is clean you see nothing at all.'),

      h2('Cheat sheet'),
      table(['I want to…', 'Run'], [
        ['Check this folder', '`forkguard`'],
        ['Check another folder', '`forkguard path/to/project`'],
        ['Check a GitHub repo without cloning it', '`forkguard owner/repo`'],
        ['Check all my repos on GitHub', '`forkguard --mine`'],
        ['Clean this folder', '`forkguard fix`'],
        ['Clean it on GitHub with a pull request', '`forkguard pr`'],
        ['Send the fix to the repo I forked from', '`forkguard pr --upstream`'],
        ['Check automatically before npm and after git', '`forkguard setup`'],
        ['Turn automatic checks off', '`forkguard setup --remove`'],
        ['Skip the check once', '`FORKGUARD_SKIP=1 npm install`'],
        ['Get results as JSON', '`forkguard --json`'],
        ['Add safety rules for AI agents (next release)', '`forkguard agent --write`'],
        ['See the version', '`forkguard --version`'],
      ]),
    ],
  },
];
