#!/usr/bin/env python3
"""Bridge from the official ARC-AGI-3 engine (arcengine) to the JavaScript
agents, over JSON lines on stdin/stdout.

    python3 tools/arc3-bridge.py <environment_dir>

<environment_dir> is a game folder as the official toolkit downloads it
(environment_files/<game>/<version>/ with metadata.json and <game>.py). The
game class is loaded exactly as arc_agi's LocalEnvironmentWrapper loads it
and stepped through ARCBaseGame.perform_action, so frames, animation lists,
states, level counters, available actions, RESET and ACTION6 click
semantics are the engine's own.

Requests (one JSON object per line):
    {"cmd": "info"}                      -> {"game_id", "baselines", "win_levels"}
    {"cmd": "reset"}                     -> observation
    {"cmd": "step", "id": 1..7, "x", "y"} -> observation
    {"cmd": "quit"}
Observation: {"frames": [64x64 int grids], "state", "levels_completed",
"win_levels", "available_actions"}. The agent is never shown the game's
title, description or tags: only what an agent of the official API sees.
"""
import importlib.util
import inspect
import json
import sys
from pathlib import Path

from arcengine import ARCBaseGame, ActionInput, GameAction


def load_game(env_dir, seed=0):
    env_dir = Path(env_dir)
    meta = json.loads((env_dir / "metadata.json").read_text())
    game_id = meta.get("game_id", env_dir.parent.name)
    short = game_id.split("-")[0]
    class_name = meta.get("class_name") or (short[0].upper() + short[1:])
    candidates = [env_dir / f"{class_name.lower()}.py", env_dir / f"{class_name}.py"]
    game_file = next((p for p in candidates if p.exists()), None)
    if game_file is None:
        raise FileNotFoundError(f"no game source in {env_dir}")
    spec = importlib.util.spec_from_loader(f"arc_agi_3.{short}", loader=None)
    module = importlib.util.module_from_spec(spec)
    exec(game_file.read_text(encoding="utf-8"), module.__dict__)
    cls = getattr(module, class_name)
    assert issubclass(cls, ARCBaseGame)
    kwargs = {"seed": seed} if "seed" in inspect.signature(cls).parameters else {}
    return cls(**kwargs), meta


def to_obs(fd):
    frames = []
    for f in (fd.frame or []):
        frames.append(f.tolist() if hasattr(f, "tolist") else [list(map(int, row)) for row in f])
    state = fd.state.name if hasattr(fd.state, "name") else str(fd.state)
    return {"frames": frames, "state": state, "levels_completed": int(fd.levels_completed),
            "win_levels": int(fd.win_levels), "available_actions": [int(a) for a in (fd.available_actions or [])]}


def main():
    game, meta = load_game(sys.argv[1], int(sys.argv[2]) if len(sys.argv) > 2 else 0)
    out = sys.stdout
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        req = json.loads(line)
        cmd = req.get("cmd")
        try:
            if cmd == "info":
                res = {"game_id": meta.get("game_id"), "baselines": meta.get("baseline_actions") or []}
            elif cmd == "reset":
                res = to_obs(game.perform_action(ActionInput(id=GameAction.RESET), raw=True))
            elif cmd == "step":
                aid = int(req["id"])
                action = GameAction.from_id(aid) if hasattr(GameAction, "from_id") else [a for a in GameAction if a.value == aid][0]
                data = {"x": int(req.get("x", 0)), "y": int(req.get("y", 0))} if aid == 6 else {}
                res = to_obs(game.perform_action(ActionInput(id=action, data=data), raw=True))
            elif cmd == "quit":
                break
            else:
                res = {"error": f"unknown cmd {cmd}"}
        except Exception as e:  # report, keep serving
            res = {"error": repr(e)}
        out.write(json.dumps(res, separators=(",", ":")) + "\n")
        out.flush()


if __name__ == "__main__":
    main()
