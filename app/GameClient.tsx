"use client";

import React, { useEffect, useRef, useState } from "react";
import {
    VIBE_COMPONENTS,
    VibeComponentConfig,
  } from "./components/vibeComponents";
import { PROMPTS } from "./components/prompts";
import { KEYWORD_POOL, Keyword } from "./components/keywords";
  

type Phase = "intro" | "movement" | "writing" | "end";

type Difficulty = "light" | "medium" | "heavy" | "insane";

type FallingComponent = {
    id: number;
    x: number;
    y: number;
    width: number;
    height: number;
    speedY: number;
    rotation: number;
    rotationSpeed: number;
    config: VibeComponentConfig;
}; 

const DEFAULT_GAME_WIDTH = 800;
const DEFAULT_GAME_HEIGHT = 640;

const PLAYER_WIDTH = 80;
const PLAYER_HEIGHT = 150;
const PLAYER_SPEED_PX_PER_SEC = 350;

const MOVE_PHASE_DURATION_MS = 10_000;
const WRITING_PHASE_DURATION_MS = 20_000; // 20s writing window

const GROUND_HEIGHT = 40;
function mapDifficultyToBaseFallSpeed(difficulty: "light" | "medium" | "heavy" | "insane"): number {
    switch (difficulty) {
      case "light":
        return 250; // slow fall
      case "medium":
        return 350;
      case "heavy":
        return 480;
      case "insane":
        return 650; // extremely fast
      default:
        return 300;
    }
  }
type DifficultyConfig = {
  spawnIntervalMs: number; // lower = more frequent spawns
  fallSpeed: number; // base speed in px/s
};

const DIFFICULTY_CONFIG: Record<Difficulty, DifficultyConfig> = {
  light: { spawnIntervalMs: 900, fallSpeed: 120 },
  medium: { spawnIntervalMs: 650, fallSpeed: 170 },
  heavy: { spawnIntervalMs: 450, fallSpeed: 220 },
  insane: { spawnIntervalMs: 280, fallSpeed: 280 },
};

function mapScoreToDifficulty(score: number): Difficulty {
  if (score >= 9.5) return "light";
  if (score >= 7) return "medium";
  if (score >= 4) return "heavy";
  return "insane";
}

const GameClient: React.FC = () => {
  const [phase, setPhase] = useState<Phase>("intro");
  const [lives, setLives] = useState(3);
  const [score, setScore] = useState(0); // time survived * 100
  const [timeSurvivedMs, setTimeSurvivedMs] = useState(0);
  const [difficulty, setDifficulty] = useState<Difficulty>("medium");

  const [movementPhaseElapsedMs, setMovementPhaseElapsedMs] = useState(0);
  const [writingTimeLeftMs, setWritingTimeLeftMs] = useState(
    WRITING_PHASE_DURATION_MS
  );

  const [gameWidth, setGameWidth] = useState(DEFAULT_GAME_WIDTH);
  const [gameHeight, setGameHeight] = useState(DEFAULT_GAME_HEIGHT);

  const [playerX, setPlayerX] = useState(
    DEFAULT_GAME_WIDTH / 2 - PLAYER_WIDTH / 2
  );
  const [playerY, setPlayerY] = useState(DEFAULT_GAME_HEIGHT - PLAYER_HEIGHT - GROUND_HEIGHT);
  const [facing, setFacing] = useState<"left" | "right">("right");

  const [components, setComponents] = useState<FallingComponent[]>([]);
  const nextComponentIdRef = useRef(1);

  const [currentPrompt, setCurrentPrompt] = useState<string | null>(null);
  const [typedText, setTypedText] = useState("");

  const [lastAiScore, setLastAiScore] = useState<number | null>(null);
  const [killedBy, setKilledBy] = useState<string | null>(null);

  const [isEvaluating, setIsEvaluating] = useState(false);
  const [lastAiComment, setLastAiComment] = useState<string | null>(null);    

  const [currentKeywords, setCurrentKeywords] = useState<Keyword[]>([]);


  // movement: -1 left, 0 none, 1 right
    const moveDirectionRef = useRef<number>(0);
    const lastTimestampRef = useRef<number | null>(null);
    const lastSpawnTimeRef = useRef<number>(0);

    const playfieldRef = useRef<HTMLDivElement | null>(null);

    const playerXRef = useRef(playerX);
    const playerYRef = useRef(playerY);
    const playerVelYRef = useRef(0);

    const gameWidthRef = useRef(gameWidth);
    const gameHeightRef = useRef(gameHeight);

    const lastHitTimeRef = useRef<number>(0);
    const leftPressedRef = useRef(false);
    const rightPressedRef = useRef(false);

    

  // ---- measure playfield to make world truly fullscreen ----
  useEffect(() => {
    function handleResize() {
      if (!playfieldRef.current) return;
      const rect = playfieldRef.current.getBoundingClientRect();
      setGameWidth(rect.width);
      setGameHeight(rect.height);
    }
  
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // recenter player when gameWidth changes (e.g., on resize or first measure)
  // recenter player when gameWidth/Height changes (e.g., on resize or first measure)
useEffect(() => {
    const groundY = gameHeight - PLAYER_HEIGHT - GROUND_HEIGHT;
    const centerX = gameWidth / 2 - PLAYER_WIDTH / 2;
  
    setPlayerX(centerX);
    setPlayerY(groundY);
  
    playerXRef.current = centerX;
    playerYRef.current = groundY;
  }, [gameWidth, gameHeight]);
  
  // keep refs in sync with latest state
  useEffect(() => {
    playerXRef.current = playerX;
  }, [playerX]);
  
  useEffect(() => {
    playerYRef.current = playerY;
  }, [playerY]);
  
  useEffect(() => {
    gameWidthRef.current = gameWidth;
  }, [gameWidth]);
  
  useEffect(() => {
    gameHeightRef.current = gameHeight;
  }, [gameHeight]);

  // ---- keyboard input for player movement ----
  useEffect(() => {
    function updateMoveDirection() {
      if (leftPressedRef.current && !rightPressedRef.current) {
        moveDirectionRef.current = -1;
        setFacing("left");
      } else if (rightPressedRef.current && !leftPressedRef.current) {
        moveDirectionRef.current = 1;
        setFacing("right");
      } else {
        moveDirectionRef.current = 0;
      }
    }
  
    function handleKeyDown(e: KeyboardEvent) {
      if (phase !== "movement") return;
  
      if (e.key === "ArrowLeft" || e.key === "a" || e.key === "A") {
        leftPressedRef.current = true;
        updateMoveDirection();
      } else if (e.key === "ArrowRight" || e.key === "d" || e.key === "D") {
        rightPressedRef.current = true;
        updateMoveDirection();
      }
  
      // Jump: space / W / ArrowUp
      if (
        e.key === " " ||
        e.key === "ArrowUp" ||
        e.key === "w" ||
        e.key === "W"
      ) {
        const groundY = gameHeight - PLAYER_HEIGHT - GROUND_HEIGHT;
        const onGround = Math.abs(playerYRef.current - groundY) < 2;
        if (onGround) {
          playerVelYRef.current = -550; // tweak to taste
        }
      }
    }
  
    function handleKeyUp(e: KeyboardEvent) {
      if (phase !== "movement") return;
  
      if (e.key === "ArrowLeft" || e.key === "a" || e.key === "A") {
        leftPressedRef.current = false;
        updateMoveDirection();
      } else if (e.key === "ArrowRight" || e.key === "d" || e.key === "D") {
        rightPressedRef.current = false;
        updateMoveDirection();
      }
    }
  
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [phase, gameHeight]);

  // ---- main game loop for movement phase ----
  useEffect(() => {
    if (phase !== "movement") {
      lastTimestampRef.current = null;
      return;
    }
  
    let animationFrameId: number | null = null;
  
    const loop = (timestamp: number) => {
      if (lastTimestampRef.current == null) {
        lastTimestampRef.current = timestamp;
        animationFrameId = requestAnimationFrame(loop);
        return;
      }
  
      const deltaMs = timestamp - lastTimestampRef.current;
      lastTimestampRef.current = timestamp;
      const deltaSec = deltaMs / 1000;
  
      const gw = gameWidthRef.current || DEFAULT_GAME_WIDTH;
      const gh = gameHeightRef.current || DEFAULT_GAME_HEIGHT;
  
      // update timers
      setTimeSurvivedMs((prev) => prev + deltaMs);
      setScore((prev) => Math.floor(prev + deltaMs * 0.1)); // ~100 per second
  
      // update movement-phase timer
      setMovementPhaseElapsedMs((prev) => {
        const next = prev + deltaMs;
        if (next >= MOVE_PHASE_DURATION_MS) {
          // transition to writing phase
          startWritingPhase();
          return 0;
        }
        return next;
      });
  
      // update player horizontal position
      setPlayerX((prevX) => {
        const dir = moveDirectionRef.current;
        let nextX = prevX + dir * PLAYER_SPEED_PX_PER_SEC * deltaSec;
        if (nextX < 0) nextX = 0;
        if (nextX > gw - PLAYER_WIDTH) nextX = gw - PLAYER_WIDTH;
        return nextX;
      });
  
      // vertical physics (jump + gravity)
      const GRAVITY = 1400;
      let vy = playerVelYRef.current + GRAVITY * deltaSec;
      let y = playerYRef.current + vy * deltaSec;
      const groundY = gh - PLAYER_HEIGHT - GROUND_HEIGHT;
  
      if (y > groundY) {
        y = groundY;
        vy = 0;
      }
  
      playerVelYRef.current = vy;
      playerYRef.current = y;
      setPlayerY(y);
  
      // spawn new components
      const now = performance.now();
      const baseFallSpeed = mapDifficultyToBaseFallSpeed(difficulty);
  
      let spawnIntervalMs = 1200;
      if (difficulty === "medium") spawnIntervalMs = 900;
      if (difficulty === "heavy") spawnIntervalMs = 650;
      if (difficulty === "insane") spawnIntervalMs = 450;
  
      if (now - lastSpawnTimeRef.current > spawnIntervalMs) {
        spawnComponent(baseFallSpeed);
        lastSpawnTimeRef.current = now;
      }
  
      // update components positions + handle collisions & cleanup
      const px = playerXRef.current;
      const py = playerYRef.current;
  
      setComponents((prev) => {
        const updated: FallingComponent[] = [];
        let hitPlayerThisFrame = false;
        let killedByType: string | null = null;
  
        const nowInner = performance.now();
  
        for (const c of prev) {
          const nextY = c.y + c.speedY * deltaSec;
          const nextRotation = c.rotation + c.rotationSpeed * deltaSec;
  
          // remove components that have fallen well below the screen
          if (nextY > gh + 100) {
            continue;
          }
  
          // collision check vs. the NEXT position
          const overlapsHorizontally =
            c.x < px + PLAYER_WIDTH && c.x + c.width > px;
          const overlapsVertically =
            nextY < py + PLAYER_HEIGHT && nextY + c.height > py;
  
          const canHitAgain = nowInner - lastHitTimeRef.current > 250;
  
          if (
            overlapsHorizontally &&
            overlapsVertically &&
            !hitPlayerThisFrame &&
            canHitAgain
          ) {
            // register one hit and REMOVE this component
            hitPlayerThisFrame = true;
            lastHitTimeRef.current = nowInner;
            killedByType = c.config.title;
            continue; // do not keep this component
          }
  
          // keep component with updated position & rotation
          updated.push({
            ...c,
            y: nextY,
            rotation: nextRotation,
          });
        }
  
        if (hitPlayerThisFrame) {
          setLives((prevLives) => {
            const next = prevLives - 1;
            if (next <= 0) {
              setKilledBy(killedByType ?? "Unknown Asset");
              setPhase("end");
            }
            return next;
          });
        }
  
        return updated;
      });
  
      if (phase === "movement") {
        animationFrameId = requestAnimationFrame(loop);
      }
    };
  
    animationFrameId = requestAnimationFrame(loop);
  
    return () => {
      if (animationFrameId !== null) cancelAnimationFrame(animationFrameId);
    };
  }, [phase, difficulty]);

  function spawnComponent(baseFallSpeed: number) {
    setComponents((prev) => {
      const id = nextComponentIdRef.current++;
  
      const config =
        VIBE_COMPONENTS[Math.floor(Math.random() * VIBE_COMPONENTS.length)];
  
      let width: number;
      let height: number;
      switch (config.size) {
        case "sm":
          width = 200; // was 150
          height = 60; // was 40
          break;
        case "md":
          width = 300; // was 220
          height = 120; // was 70
          break;
        case "lg":
        default:
          width = 380; // was 280
          height = 160; // was 110
          break;
      }
  
      const gw = gameWidthRef.current || gameWidth;
      const x = Math.random() * Math.max(1, gw - width);
      const y = -height - 10;
  
      const speedY = baseFallSpeed * (0.8 + Math.random() * 0.5);
      const rotationSpeed = (Math.random() - 0.5) * 60; // deg/sec
  
      const comp: FallingComponent = {
        id,
        x,
        y,
        width,
        height,
        speedY,
        rotation: 0,
        rotationSpeed,
        config,
      };
  
      return [...prev, comp];
    });
  }

  function pickKeywords(count: number): Keyword[] {
    const shuffled = [...KEYWORD_POOL].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, count);
  }
  // ---- writing phase handling ----
  function startWritingPhase() {
    setPhase("writing");
    setWritingTimeLeftMs(WRITING_PHASE_DURATION_MS);
    setTypedText("");
  
    const prompt =
      PROMPTS[Math.floor(Math.random() * PROMPTS.length)] ??
      "Write a short, serious update about your work.";
    setCurrentPrompt(prompt);
  
    const kws = pickKeywords(3);
    setCurrentKeywords(kws);
  }

  function renderHighlightedText(text: string, keywords: Keyword[]) {
  if (!text) return <span>&nbsp;</span>;

  const escaped = keywords
    .map((k) => k.word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("|");

  if (!escaped) {
    return <span>{text}</span>;
  }

  const regex = new RegExp(`(${escaped})`, "gi");
  const parts: React.ReactNode[] = [];

  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    const matchText = match[0];
    const matchIndex = match.index;

    if (matchIndex > lastIndex) {
      parts.push(
        <span key={`t-${lastIndex}`}>{text.slice(lastIndex, matchIndex)}</span>
      );
    }

    const kw = keywords.find(
      (k) => matchText.toLowerCase().includes(k.word.toLowerCase())
    );

    parts.push(
      <span
        key={`k-${matchIndex}`}
        className={kw ? kw.colorClass : "text-sky-700"}
      >
        {matchText}
      </span>
    );

    lastIndex = matchIndex + matchText.length;
  }

  if (lastIndex < text.length) {
    parts.push(
      <span key={`t-${lastIndex}`}>{text.slice(lastIndex)}</span>
    );
  }

  return parts;
}
  

  // writing-phase countdown
  useEffect(() => {
    if (phase !== "writing") return;

    let intervalId: number | null = null;

    intervalId = window.setInterval(() => {
      setWritingTimeLeftMs((prev) => {
        const next = prev - 100;
        if (next <= 0) {
          // auto-submit when time runs out
          handleSubmitText();
          return 0;
        }
        return next;
      });
    }, 100);

    return () => {
      if (intervalId !== null) window.clearInterval(intervalId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  async function handleSubmitText() {
    // avoid double-submit
    if (phase !== "writing") return;
    if (isEvaluating) return;
  
    // if nothing typed, treat as 0 and skip network
    if (!typedText.trim()) {
      const zeroScore = 0;
      setLastAiScore(zeroScore);
      setLastAiComment("No content provided.");
      const nextDiff = mapScoreToDifficulty(zeroScore);
      setDifficulty(nextDiff);
      setPhase("movement");
      setMovementPhaseElapsedMs(0);
      setCurrentPrompt(null);
      return;
    }
  
    try {
      setIsEvaluating(true);
  
      const res = await fetch("/api/evaluate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            text: typedText,
            prompt: currentPrompt,
            keywords: currentKeywords.map((k) => k.word),
        }),
      });
  
      if (!res.ok) {
        // fall back to a neutral score on error
        const fallbackScore = 5;
        setLastAiScore(fallbackScore);
        setLastAiComment("Evaluation failed; using a neutral difficulty.");
        const nextDiff = mapScoreToDifficulty(fallbackScore);
        setDifficulty(nextDiff);
      } else {
        const data = (await res.json()) as {
          score: number;
          comment?: string;
        };
        const roundedScore =
          Math.round(Math.max(0, Math.min(10, data.score)) * 10) / 10;
  
        setLastAiScore(roundedScore);
        setLastAiComment(data.comment ?? null);
  
        const nextDiff = mapScoreToDifficulty(roundedScore);
        setDifficulty(nextDiff);
  
        // regain life on near-perfect scores
        if (roundedScore >= 9.8) {
          setLives((prev) => Math.min(3, prev + 1));
        }
      }
    } catch (err) {
      console.error("Error calling /api/evaluate:", err);
      const fallbackScore = 5;
      setLastAiScore(fallbackScore);
      setLastAiComment("Evaluation error; using a neutral difficulty.");
      const nextDiff = mapScoreToDifficulty(fallbackScore);
      setDifficulty(nextDiff);
    } finally {
      setIsEvaluating(false);
      // back to movement
      setPhase("movement");
      setMovementPhaseElapsedMs(0);
      setCurrentPrompt(null);
    }
  }

  function handleStartGame() {
    const groundY = gameHeight - PLAYER_HEIGHT - GROUND_HEIGHT;
  
    setPhase("movement");
    setLives(3);
    setScore(0);
    setTimeSurvivedMs(0);
    setMovementPhaseElapsedMs(0);
    setDifficulty("medium");
    setComponents([]);
    setKilledBy(null);
    setLastAiScore(null);
    setLastAiComment(null);
    setTypedText("");
  
    const centerX = gameWidth / 2 - PLAYER_WIDTH / 2;
    setPlayerX(centerX);
    setPlayerY(groundY);
    playerXRef.current = centerX;
    playerYRef.current = groundY;
    playerVelYRef.current = 0;
  
    lastHitTimeRef.current = 0;
    leftPressedRef.current = false;
    rightPressedRef.current = false;
    moveDirectionRef.current = 0;
  
    lastSpawnTimeRef.current = performance.now();
  }
  

  function handleRetry() {
    handleStartGame();
    setPhase("movement");
  }

  const timeSurvivedSec = Math.floor(timeSurvivedMs / 1000);
  const writingSecondsLeft = Math.max(
    0,
    Math.ceil(writingTimeLeftMs / 1000)
  );

  return (
    <div className="w-full h-screen bg-white">
      
      {/* playfield fills remaining screen in light mode */}
      <div className="w-full h-full flex items-stretch justify-stretch">
        <div
          ref={playfieldRef}
          className="relative bg-slate-100 border-t border-slate-200 overflow-hidden"
          style={{ width: "100%", height: "100%" }}
        >
          {/* HUD overlays */}
            <div className="absolute top-3 left-4 text-xs sm:text-sm text-slate-800">
                <span className="uppercase tracking-[0.18em] text-[18px] text-slate-500">
                Score
                </span>
                <div className="font-mono font-semibold text-[26px] leading-tight">
                {score.toString().padStart(5, "0")}
                </div>
            </div>

            <div className="absolute top-3 right-4 flex items-center gap-2 text-4xl select-none">
                {Array.from({ length: 3 }).map((_, i) => (
                    <span key={i}>
                    {i < lives ? "❤️" : "🤍"}
                    </span>
                ))}
                </div>
          {/* ground */}
            <div
                className="absolute left-0 bottom-0 w-full border-t border-slate-300 bg-slate-200/90"
                style={{ height: GROUND_HEIGHT }}
            />
          {/* player sprite */}
            {phase !== "intro" && phase !== "end" && (
            <div
                className="absolute"
                style={{
                width: PLAYER_WIDTH,
                height: PLAYER_HEIGHT,
                left: playerX,
                top: playerY,
                backgroundImage: "url('assets/corporate_guy.png')",
                backgroundSize: "contain",
                backgroundRepeat: "no-repeat",
                backgroundPosition: "bottom center",
                transform: facing === "left" ? "scaleX(-1)" : "scaleX(1)",
                transformOrigin: "center",
                }}
            />
            )}

          {/* falling components */}
          {components.map((c) => {
            const cfg = c.config;

            return (
                <div
                key={c.id}
                className={`absolute rounded-xl shadow-md overflow-hidden border text-[12px] ${cfg.bgClass} ${cfg.textClass} ${cfg.borderClass}`}
                style={{
                    width: c.width,
                    height: c.height,
                    left: c.x,
                    top: c.y,
                    transform: `rotate(${c.rotation}deg)`,
                }}
                >
                {cfg.kind === "linkedin-post" ? (
                    <div className="flex flex-col h-full p-2 gap-1">
                    <div className="flex items-center gap-2">
                        <div className="w-5 h-5 rounded-full bg-slate-300" />
                        <div className="flex-1">
                        <div className="font-semibold truncate text-[12px]">
                            {cfg.title}
                        </div>
                        <div className="text-[10px] text-slate-500 truncate">
                            {cfg.subtitle ?? " · 1st · 12h"}
                        </div>
                        </div>
                    </div>
                    <div className="flex-1 mt-1 rounded-md bg-slate-200/70 overflow-hidden">
                        {cfg.imageSrc ? (
                        <div
                            className="w-full h-full bg-cover bg-center"
                            style={{ backgroundImage: `url(${cfg.imageSrc})` }}
                        />
                        ) : (
                        <div className="w-full h-full flex items-center justify-center text-[8px] text-slate-500">
                            Image from your network
                        </div>
                        )}
                    </div>
                    </div>
                ) : (
                    <div className="flex flex-col h-full p-2">
                    <div className={`h-2 w-12 rounded-full mb-2 ${cfg.accentClass}`} />
                    <div className="text-[12px] font-semibold truncate">
                        {cfg.title}
                    </div>
                    {cfg.subtitle && (
                        <div className="text-[10px] opacity-80 truncate">
                        {cfg.subtitle}
                        </div>
                    )}
                    {cfg.kind === "pricing" && (
                        <div className="mt-auto text-[10px] font-medium opacity-90">
                        {cfg.description ?? "Billed annually. Cancel anytime."}
                        </div>
                    )}
                    {cfg.kind === "dashboard" && (
                        <div className="mt-auto flex items-end justify-between gap-2">
                            {/* KPI block */}
                            <div className="flex flex-col">
                            <div className="text-[13px] font-semibold leading-tight">
                                +12.4%
                            </div>
                            <div className="text-[10px] opacity-70">
                                vs last week
                            </div>
                            </div>

                            {/* tiny sparkline bars */}
                            <div className="flex items-end gap-[2px] h-8">
                            <div className="w-1.5 rounded-full bg-slate-300/60 h-2" />
                            <div className="w-1.5 rounded-full bg-slate-300/70 h-3" />
                            <div className="w-1.5 rounded-full bg-slate-300/70 h-5" />
                            <div className="w-1.5 rounded-full bg-slate-300/80 h-7" />
                            <div className="w-1.5 rounded-full bg-slate-300/60 h-4" />
                            <div className="w-1.5 rounded-full bg-slate-300/50 h-3" />
                            </div>
                        </div>
                    )}
                    </div>
                )}
                </div>
            );
            })}

          {/* intro overlay */}
          {phase === "intro" && (
            <div className="absolute inset-0 flex items-center justify-center">
                {/* Background image layer */}
                <div
                className="absolute inset-0 bg-center bg-cover"
                style={{
                    backgroundImage: "url('assets/background_pic1.avif')", // adjust extension if needed
                }}
                >
                {/* White overlay for softness / readability */}
                <div className="w-full h-full bg-white/70" />
                </div>

                {/* Foreground card */}
                <div className="relative bg-white shadow-2xl border border-slate-200 rounded-xl p-10 max-w-xl text-center text-slate-800">
                <h1 className="text-3xl font-bold tracking-tight mb-4">
                    Strategic Impact Simulation
                </h1>

                <p className="text-lg font-semibold text-slate-600 mb-6">
                    A controlled environment designed to benchmark your readiness for high-velocity professional realities.
                </p>

                <div className="text-base leading-relaxed text-slate-700 space-y-3 mb-8">
                    <p>
                    Use <span className="font-semibold">←/→</span> or <span className="font-semibold">A/D</span> to maintain positioning across shifting organizational dynamics.
                    </p>
                    <p>
                    Incoming assets represent cross-functional expectations. Please avoid them to reduce operational drag.
                    </p>
                    <p>
                    At regular intervals, you will craft a{" "}
                    <span className="font-semibold">succinct narrative update</span> demonstrating alignment, gratitude, and strategic optimism.
                    Your corporate tone directly determines the intensity of subsequent workload surges.
                    </p>
                </div>

                <button
                    onClick={handleStartGame}
                    className="px-6 py-3 rounded-lg bg-sky-600 hover:bg-sky-700 text-white font-semibold text-base shadow-md transition-all"
                >
                    Launch Simulation
                </button>
                </div>
            </div>
            )}



          {/* writing overlay */}
          {phase === "writing" && (
            <div className="absolute inset-0 bg-slate-900/5 backdrop-blur-[2px] flex items-center justify-center px-4">
                <div className="w-full max-w-2xl bg-white/95 rounded-2xl border border-slate-200 shadow-[0_18px_45px_rgba(15,23,42,0.18)] p-5 sm:p-6 flex flex-col gap-4">
                {/* Header + prompt */}
                <div className="flex items-start justify-between gap-4">
                    <div className="space-y-1">
                    <div className="text-[11px] font-semibold tracking-[0.18em] text-slate-500 uppercase">
                        Professional Update Required
                    </div>
                    <div className="text-sm sm:text-[15px] text-slate-800">
                        {currentPrompt ?? "Write a short, serious update."}
                    </div>
                    </div>
                    <div className="shrink-0">
                    <div className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-mono text-slate-700 shadow-sm">
                        {writingSecondsLeft}s
                    </div>
                    </div>
                </div>

                {/* Keywords – large, bold, colored */}
                {currentKeywords.length > 0 && (
                    <div className="flex flex-wrap gap-x-6 gap-y-1 mt-1">
                    {currentKeywords.map((kw) => (
                        <span
                        key={kw.id}
                        className={`${kw.colorClass} text-base font-bold tracking-wide`}
                        >
                        {kw.word}
                        </span>
                    ))}
                    </div>
                )}

                {/* Input surface with highlight overlay */}
                <div className="relative mt-2">
                    {/* Highlight layer */}
                    <div className="pointer-events-none absolute inset-0 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm leading-relaxed text-slate-800 whitespace-pre-wrap">
                    {renderHighlightedText(typedText || " ", currentKeywords)}
                    </div>

                    {/* Transparent textarea on top */}
                    <textarea
                    value={typedText}
                    onChange={(e) => {
                        const val = e.target.value;
                        setTypedText(val);
                    }}
                    className="relative w-full h-32 rounded-xl border border-transparent bg-transparent px-3 py-2 text-sm leading-relaxed text-transparent caret-slate-800 resize-none focus:outline-none focus:ring-2 focus:ring-sky-500"
                    placeholder="Compose a concise, confident, LinkedIn-ready update..."
                    />
                </div>

                {/* Footer: score + button */}
                <div className="mt-1 flex items-center justify-between gap-3">
                    <div className="text-[11px] text-slate-500">
                    {lastAiScore != null && (
                        <>
                        Last round score: {lastAiScore}/10
                        {lastAiComment ? ` — ${lastAiComment}` : null}
                        </>
                    )}
                    </div>
                    <button
                    onClick={handleSubmitText}
                    disabled={isEvaluating}
                    className={`px-4 py-2 text-xs sm:text-sm rounded-lg font-semibold text-white shadow-sm transition-colors ${
                        isEvaluating
                        ? "bg-slate-400 cursor-not-allowed"
                        : "bg-sky-500 hover:bg-sky-600"
                    }`}
                    >
                    {isEvaluating ? "Evaluating…" : "Submit Update"}
                    </button>
                </div>
                </div>
            </div>
            )}


          {/* end overlay */}
          {phase === "end" && (
            <div className="absolute inset-0 bg-white/90 flex items-center justify-center">
              <div className="w-[80%] max-w-md bg-white rounded-lg shadow-lg border border-slate-200 p-5 flex flex-col gap-3">
                <h2 className="text-lg font-semibold text-slate-800">
                  Simulation Concluded
                </h2>
                <div className="text-sm text-slate-700">
                  Final score:{" "}
                  <span className="font-mono font-semibold">{score}</span>
                </div>
                <div className="text-sm text-slate-700">
                  Time survived:{" "}
                  <span className="font-mono">{timeSurvivedSec}s</span>
                </div>
                <div className="text-sm text-slate-700">
                  Bested by:{" "}
                  <span className="font-semibold">
                    {killedBy ?? "Cumulative Operational Load"}
                  </span>
                </div>
                {lastAiScore != null && (
                  <div className="text-xs text-slate-500">
                    Last corporate score: {lastAiScore}/10
                  </div>
                )}
                <div className="mt-3 flex justify-end gap-2">
                  <button
                    onClick={handleRetry}
                    className="px-3 py-1.5 text-xs bg-sky-500 hover:bg-sky-600 text-white rounded-md"
                  >
                    Retry Simulation
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default GameClient;
