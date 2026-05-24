import { useState, useRef, useEffect } from "react";
import { Play, Pause, Volume2 } from "lucide-react";

interface PodcastPlayerProps {
  audioUrl: string;
  title: string;
}

export function PodcastPlayer({ audioUrl, title }: PodcastPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
      if (audio.duration && !isNaN(audio.duration)) {
        setProgress((audio.currentTime / audio.duration) * 100);
      }
    };
    const onLoadedMetadata = () => {
      if (!isNaN(audio.duration)) setDuration(audio.duration);
    };
    const onEnded = () => setPlaying(false);

    audio.addEventListener("timeupdate", onTimeUpdate);
    audio.addEventListener("loadedmetadata", onLoadedMetadata);
    audio.addEventListener("ended", onEnded);
    return () => {
      audio.removeEventListener("timeupdate", onTimeUpdate);
      audio.removeEventListener("loadedmetadata", onLoadedMetadata);
      audio.removeEventListener("ended", onEnded);
    };
  }, []);

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) {
      audio.pause();
      setPlaying(false);
    } else {
      audio.play();
      setPlaying(true);
    }
  };

  const handleScrub = (e: React.ChangeEvent<HTMLInputElement>) => {
    const audio = audioRef.current;
    if (!audio || !audio.duration) return;
    const val = Number(e.target.value);
    audio.currentTime = (val / 100) * audio.duration;
    setProgress(val);
  };

  const fmt = (s: number) => {
    if (!s || isNaN(s)) return "0:00";
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  return (
    <div className="flex flex-col gap-3 bg-muted/30 border border-border p-4 mb-8">
      <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.25em] text-primary">
        <Volume2 className="w-3.5 h-3.5" />
        <span>Ascolta questo episodio</span>
      </div>

      <audio ref={audioRef} src={audioUrl} preload="metadata" />

      <div className="flex items-center gap-4">
        <button
          onClick={togglePlay}
          className="w-10 h-10 flex items-center justify-center border border-primary text-primary hover:bg-primary hover:text-primary-foreground transition-colors shrink-0"
          aria-label={playing ? "Pausa" : "Riproduci"}
        >
          {playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
        </button>

        <div className="flex-1 flex flex-col gap-1">
          <p className="text-xs font-medium truncate opacity-70">{title}</p>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-mono text-muted-foreground w-8 shrink-0">
              {fmt(currentTime)}
            </span>
            <input
              type="range"
              min={0}
              max={100}
              step={0.1}
              value={progress}
              onChange={handleScrub}
              className="flex-1 h-1 accent-primary cursor-pointer"
            />
            <span className="text-[10px] font-mono text-muted-foreground w-8 text-right shrink-0">
              {fmt(duration)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
