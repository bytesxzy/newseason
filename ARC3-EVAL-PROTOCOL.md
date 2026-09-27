# ARC-AGI-3 evaluation protocol (frozen before development)

Written and committed BEFORE any code of the new ARC-3 architecture was
written. It fixes what may be used for development and what is held out.

## Official interface (verified from the official toolkit source, not from memory)

Sources: `arcengine` 0.9.3 and `arc-agi` 0.9.9 wheels from PyPI (the official
ARC Prize packages; `enums.py`, `base_game.py`, `scorecard.py` read directly).
`docs.arcprize.org`, `arcprize.org` and the game API (`three.arcprize.org`) are
blocked by this container's egress policy; search summaries of the docs and
of the ARC-AGI-3 technical report (arXiv 2603.24621) agree with the code.

* Actions: `RESET` (0), `ACTION1`-`ACTION5` (simple; client convention
  up/down/left/right/space), `ACTION6` (complex: click at x, y in 0..63,
  (0,0) top-left), `ACTION7` (simple; undo by convention, game-specific).
  Each game declares `available_actions` (default [1,2,3,4,5,6]).
* Observation (`FrameData`): `frame` = a LIST of 64x64 grids (one action can
  render several frames: animation), values 0..15; `state` in NOT_PLAYED /
  NOT_FINISHED / WIN / GAME_OVER; `levels_completed`; `win_levels`;
  `available_actions`; `full_reset`.
* After WIN or GAME_OVER only RESET does anything. RESET as the first action,
  or after WIN, is a full reset; otherwise it restarts the current level.
  The engine's action counter does not count RESET; scorecards record resets
  separately.
* Scoring (`scorecard.py`): a completed level scores
  min(115, (baseline_actions / actions_taken)^2 * 100); an uncompleted level
  scores 0. A game's score is the level-index-weighted mean of its level
  scores, capped at the weight share of completed levels. The benchmark
  score is the mean over games. The technical report adds: baseline = the
  upper-median first-time human per level, and a level taken with more than
  5x the baseline actions scores 0.

## Environments available here

* **Official ARC-AGI-3 public games**: `ls20-cb3b57cc`, `ft09-9ab2447a`,
  `vc33-9851e02b`, as downloaded by the official toolkit (versioned ids,
  official per-level human baselines, `date_downloaded` 2026-03-17/18), found
  in the MIT community repository `theredbluepill/arc-interactive` (commit
  b6cbf21a36f0). The other 22 public games need the API and are not
  reachable from this container.
* **Community games**: the ~249 other games of that repository, written by
  third parties on the official engine. NOT official ARC-AGI-3 games; used as
  an independent held-out suite of genuinely unknown environments.

## Split

* **DEV (interface debugging only, never tuning)**: the community games whose
  descriptions were seen while inspecting the repository layout: ez01 ez02
  ez03 ez04 ul01 tt01 wm01 sv01 pt01 pt02 sy01 sk01 tb01 ff01 mm01 ms01 sq01
  rs01 pb01 pb02 pb03 fs01 fs02 fs03 tp01 tp02 tp03 ic01 ic02 ic03 va01 va02
  va03 nw01 bd01.
* **HELD OUT (never inspected, run once after the architecture is frozen)**:
  every other community game, and the three official games.
* Development of the architecture uses only the new synthetic generators
  (`tools/arc3-games.js`) and their frozen held-out compositions.

## Integrity

sha256 of the official game files (must be unchanged at evaluation time):

```
20a503d4d09305531e495a81f394850f6b02d11ab9b4f55861a0ff2fbd8f66ec  ls20/cb3b57cc/ls20.py
90ddb9070482c6258fc77501bb9dd23471d05338ac84509ab897e3dcb640960b  ls20/cb3b57cc/metadata.json
37493d8750afdc431b35b91c8075e810e0061af49fd0dcfa5d44be2fc4dc489f  ft09/9ab2447a/ft09.py
27ff25f7b0810bd7139a29b0dd7695fc663fd53a27e155f84f284ba75dcae83b  ft09/9ab2447a/metadata.json
0af7a3c0fe201c1ae4c6168c8d62e83c4ae87f0a72b37732011cccfd59de31dc  vc33/9851e02b/vc33.py
75cfb162906df2493849b3a384accc432eb01613f8190686934bf66ef42be708  vc33/9851e02b/metadata.json
```

sha256 over all 252 game `.py` files (sorted `sha256sum` list):
`850632c86997ee941e7178e9a18946c5eae671aa0f06305cdd74564e373525ca`.

## Freeze record (appended after the evaluation; nothing above was changed)

* Architecture frozen at commit `6353398236c9fc32afed167bfce7e85848437544`
  ("Freeze the ARC-3 architecture for the held-out evaluation"). No held-out
  synthetic family, held-out community game or official game had been run by
  the agent before it.
* Integrity at evaluation time: the six official file hashes above matched,
  and so did the aggregate hash over all 252 game files
  (`sha256sum environment_files/*/*/*.py | sha256sum`).
* Runs executed once each on that commit (the tools refuse held-out and
  official sets unless HEAD is the frozen commit and the agent sources are
  unmodified), with outputs in `arc3-results/`:
  * `node tools/arc3-bench.js --set holdout --frozen 6353398236c9 --seeds 1-5 --agents new,<ablations>,legacy,random --probe` -> `holdout-synth.json`
  * `node tools/arc3-official.js --set heldout --frozen 6353398236c9 --agents new,legacy --max-wall-min 4` (4 shards) -> `heldout-community.json`
  * `node tools/arc3-official.js --set official --frozen 6353398236c9 --agents new,legacy --max-wall-min 30` -> `official.json`
  * dev sets on the same commit, for the report's tables: `dev-frozen.json`, `dev-community-frozen.json`
* No change was made to the agent after any of these runs.
