import html
import json
import time
from functools import lru_cache
from pathlib import Path

import fugashi
import whisper
from deep_translator import GoogleTranslator

# 输入视频/音频路径
INPUT_PATH = "small.mp4"
# 输出 JSON 路径
OUTPUT_JSON = "transcript_segments.json"
# 转写语言：日文填 "ja"；不确定可改为 None 自动识别（翻译仍按日文源处理，需自行调整）
LANGUAGE = "ja"
# 段与段之间翻译间隔（秒），降低被免费翻译接口限频的概率
TRANSLATE_DELAY_SEC = 0.25


def _katakana_to_hiragana(s: str) -> str:
    out: list[str] = []
    for ch in s:
        o = ord(ch)
        if 0x30A1 <= o <= 0x30F6:
            out.append(chr(o - 0x60))
        else:
            out.append(ch)
    return "".join(out)


def _has_kanji(s: str) -> bool:
    for c in s:
        if "\u4e00" <= c <= "\u9fff" or "\u3400" <= c <= "\u4dbf":
            return True
        if c in "々〇〆ヵヶ":
            return True
    return False


@lru_cache(maxsize=1)
def _ja_tagger() -> fugashi.Tagger:
    return fugashi.Tagger()


def furigana_ruby_html(text: str) -> str:
    """用 UniDic 读音把含汉字的词包成 HTML ruby，便于浏览器或富文本渲染假名。"""
    tagger = _ja_tagger()
    parts: list[str] = []
    for word in tagger(text):
        surface = word.surface
        if not surface:
            continue
        reading = None
        feat = word.feature
        for key in ("kana", "pron", "lForm"):
            raw = getattr(feat, key, None)
            if raw and raw != "*" and not raw.startswith("@"):
                reading = raw
                break
        hira = _katakana_to_hiragana(reading) if reading else ""
        if hira and _has_kanji(surface):
            a = html.escape(surface, quote=False)
            b = html.escape(hira, quote=False)
            parts.append(f"<ruby>{a}<rt>{b}</rt></ruby>")
        else:
            parts.append(html.escape(surface, quote=False))
    return "".join(parts)


def main() -> None:
    model = whisper.load_model("turbo")
    result = model.transcribe(
        INPUT_PATH,
        language=LANGUAGE,
        verbose=False,
    )

    translator = GoogleTranslator(source="ja", target="zh-CN")
    segments_out: list[dict] = []

    for seg in result.get("segments") or []:
        text_ja = (seg.get("text") or "").strip()
        if not text_ja:
            continue
        try:
            text_zh = translator.translate(text_ja)
        except Exception:
            text_zh = ""
        segments_out.append(
            {
                "start": round(float(seg["start"]), 3),
                "end": round(float(seg["end"]), 3),
                "ja": text_ja,
                "ja_ruby_html": furigana_ruby_html(text_ja),
                "zh": text_zh,
            }
        )
        if TRANSLATE_DELAY_SEC > 0:
            time.sleep(TRANSLATE_DELAY_SEC)

    out_path = Path(OUTPUT_JSON)
    out_path.write_text(
        json.dumps(segments_out, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    print(f"已写入 {out_path.resolve()}，共 {len(segments_out)} 段")


if __name__ == "__main__":
    main()
