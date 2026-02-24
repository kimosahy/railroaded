#!/usr/bin/env bash
#
# ralph-loop.sh — Headless autonomous player agent for Quest Engine
#
# A simple bot that registers, creates a character with random stats,
# queues for a party, and then plays forever by polling for available
# actions and picking one at random.
#
# Requirements: curl, jq
# Usage:        SERVER_URL=http://localhost:3000 ./ralph-loop.sh
# Stop:         Ctrl+C
#

set -euo pipefail

# ─── Configuration ────────────────────────────────────────────────────────────

SERVER_URL="${SERVER_URL:-http://localhost:3000}"
POLL_INTERVAL="${POLL_INTERVAL:-5}"

# ─── Helpers ──────────────────────────────────────────────────────────────────

log() {
  echo "[ralph $(date '+%H:%M:%S')] $*"
}

die() {
  echo "[ralph ERROR] $*" >&2
  exit 1
}

api_get() {
  local path="$1"
  curl -sf -H "Authorization: Bearer ${TOKEN}" \
    -H "Content-Type: application/json" \
    "${SERVER_URL}${path}"
}

api_post() {
  local path="$1"
  local body="${2:-{}}"
  curl -sf -X POST \
    -H "Authorization: Bearer ${TOKEN}" \
    -H "Content-Type: application/json" \
    -d "${body}" \
    "${SERVER_URL}${path}"
}

# Check dependencies
command -v curl >/dev/null 2>&1 || die "curl is required but not installed"
command -v jq   >/dev/null 2>&1 || die "jq is required but not installed"

# ─── Generate Random Character ────────────────────────────────────────────────

# Random name from a pool
FIRST_NAMES=("Thorne" "Elara" "Grimjaw" "Lyra" "Vex" "Bramble" "Kael" "Mira" "Dorn" "Sylva"
             "Rorik" "Fenn" "Zara" "Pike" "Ember" "Ash" "Rune" "Vale" "Cinder" "Slate"
             "Wren" "Flint" "Ivy" "Storm" "Bark" "Moss" "Thorn" "Reed" "Gale" "Frost")
LAST_NAMES=("Blackwood" "Ironforge" "Nightwhisper" "Stonehelm" "Swiftblade" "Darkhollow"
            "Brightshield" "Thornwall" "Deepwater" "Ashborne" "Frostpeak" "Shadowmere"
            "Goldleaf" "Steelhand" "Wildgrove" "Duskwalker" "Starfall" "Emberheart"
            "Greymantle" "Silverbrook")

RACES=("human" "elf" "dwarf" "halfling" "half-orc")
CLASSES=("fighter" "rogue" "cleric" "wizard")

rand_element() {
  local -n arr=$1
  echo "${arr[$((RANDOM % ${#arr[@]}))]}"
}

# 4d6 drop lowest
roll_4d6_drop() {
  local rolls=()
  for i in 1 2 3 4; do
    rolls+=( $(( (RANDOM % 6) + 1 )) )
  done
  # Sort and drop lowest
  IFS=$'\n' sorted=($(sort -n <<< "${rolls[*]}")); unset IFS
  echo $(( sorted[1] + sorted[2] + sorted[3] ))
}

CHAR_FIRST=$(rand_element FIRST_NAMES)
CHAR_LAST=$(rand_element LAST_NAMES)
CHAR_NAME="${CHAR_FIRST} ${CHAR_LAST}"
CHAR_RACE=$(rand_element RACES)
CHAR_CLASS=$(rand_element CLASSES)

STAT_STR=$(roll_4d6_drop)
STAT_DEX=$(roll_4d6_drop)
STAT_CON=$(roll_4d6_drop)
STAT_INT=$(roll_4d6_drop)
STAT_WIS=$(roll_4d6_drop)
STAT_CHA=$(roll_4d6_drop)

# Ensure minimum of 3 for each stat
[[ $STAT_STR -lt 3 ]] && STAT_STR=3
[[ $STAT_DEX -lt 3 ]] && STAT_DEX=3
[[ $STAT_CON -lt 3 ]] && STAT_CON=3
[[ $STAT_INT -lt 3 ]] && STAT_INT=3
[[ $STAT_WIS -lt 3 ]] && STAT_WIS=3
[[ $STAT_CHA -lt 3 ]] && STAT_CHA=3

BACKSTORIES=(
  "A wandering sellsword looking for coin and purpose."
  "Raised in a monastery, seeking answers the monks could not give."
  "Former street thief who found a conscience."
  "Last survivor of a village destroyed by monsters. Wants revenge."
  "Noble scion who left wealth behind to prove themselves in the wilds."
  "Circus performer who discovered a talent for real combat."
  "Shipwreck survivor washed ashore with nothing but a blade and a grudge."
  "Apprentice to a now-dead mentor. Carries their unfinished work."
)

PERSONALITIES=(
  "Cautious but loyal. Speaks only when necessary."
  "Loud, brash, and always the first to laugh or fight."
  "Quiet observer who notices everything and says little."
  "Relentlessly optimistic. Believes the best in everyone, even enemies."
  "Suspicious of strangers but fiercely protective of friends."
  "Scholarly and curious. Asks too many questions."
  "Grim and fatalistic. Expects the worst, fights anyway."
  "Charming and quick-witted. Talks their way out of problems."
)

PLAYSTYLES=(
  "Aggressive — charges into combat, worries about consequences later."
  "Defensive — prioritizes survival and protecting allies."
  "Tactical — analyzes the situation before acting, prefers optimal plays."
  "Reckless — takes risks for big payoffs, lives on the edge."
  "Supportive — focuses on helping allies rather than dealing damage."
  "Balanced — adapts to what the party needs in the moment."
)

CHAR_BACKSTORY=$(rand_element BACKSTORIES)
CHAR_PERSONALITY=$(rand_element PERSONALITIES)
CHAR_PLAYSTYLE=$(rand_element PLAYSTYLES)

log "Character: ${CHAR_NAME} (${CHAR_RACE} ${CHAR_CLASS})"
log "Stats: STR=${STAT_STR} DEX=${STAT_DEX} CON=${STAT_CON} INT=${STAT_INT} WIS=${STAT_WIS} CHA=${STAT_CHA}"

# ─── Register ─────────────────────────────────────────────────────────────────

# Use a unique username based on character name + random suffix
USERNAME="ralph-$(echo "${CHAR_NAME}" | tr ' ' '-' | tr '[:upper:]' '[:lower:]')-${RANDOM}"

log "Registering as ${USERNAME}..."
REGISTER_RESPONSE=$(curl -sf -X POST \
  -H "Content-Type: application/json" \
  -d "{\"username\": \"${USERNAME}\", \"role\": \"player\"}" \
  "${SERVER_URL}/register") || die "Registration failed. Is the server running at ${SERVER_URL}?"

PASSWORD=$(echo "${REGISTER_RESPONSE}" | jq -r '.password')
USER_ID=$(echo "${REGISTER_RESPONSE}" | jq -r '.id')

[[ -z "${PASSWORD}" || "${PASSWORD}" == "null" ]] && die "Registration returned no password: ${REGISTER_RESPONSE}"

log "Registered. User ID: ${USER_ID}"

# ─── Login ────────────────────────────────────────────────────────────────────

log "Logging in..."
LOGIN_RESPONSE=$(curl -sf -X POST \
  -H "Content-Type: application/json" \
  -d "{\"username\": \"${USERNAME}\", \"password\": \"${PASSWORD}\"}" \
  "${SERVER_URL}/login") || die "Login failed"

TOKEN=$(echo "${LOGIN_RESPONSE}" | jq -r '.token')

[[ -z "${TOKEN}" || "${TOKEN}" == "null" ]] && die "Login returned no token: ${LOGIN_RESPONSE}"

log "Logged in. Token acquired."

# ─── Create Character ────────────────────────────────────────────────────────

log "Creating character: ${CHAR_NAME}..."

CREATE_BODY=$(jq -n \
  --arg name "${CHAR_NAME}" \
  --arg race "${CHAR_RACE}" \
  --arg class "${CHAR_CLASS}" \
  --argjson str "${STAT_STR}" \
  --argjson dex "${STAT_DEX}" \
  --argjson con "${STAT_CON}" \
  --argjson int "${STAT_INT}" \
  --argjson wis "${STAT_WIS}" \
  --argjson cha "${STAT_CHA}" \
  --arg backstory "${CHAR_BACKSTORY}" \
  --arg personality "${CHAR_PERSONALITY}" \
  --arg playstyle "${CHAR_PLAYSTYLE}" \
  '{
    name: $name,
    race: $race,
    class: $class,
    ability_scores: {str: $str, dex: $dex, con: $con, int: $int, wis: $wis, cha: $cha},
    backstory: $backstory,
    personality: $personality,
    playstyle: $playstyle
  }')

CREATE_RESPONSE=$(api_post "/api/v1/character" "${CREATE_BODY}") || die "Character creation failed"
log "Character created: $(echo "${CREATE_RESPONSE}" | jq -r '.character.name // "ok"')"

# ─── Queue for Party ──────────────────────────────────────────────────────────

log "Queuing for party..."
QUEUE_RESPONSE=$(api_post "/api/v1/queue" "{}") || log "Queue request failed (may already be queued)"
log "Queued. Waiting for party match..."

# ─── Main Game Loop ──────────────────────────────────────────────────────────

CHAT_LINES=(
  "I have a bad feeling about this."
  "Stay close. Something is not right."
  "Anyone else hear that?"
  "Let me take point."
  "We should rest soon."
  "Check that corner."
  "Nice hit!"
  "I need healing!"
  "Watch the flanks!"
  "Press the attack!"
  "Hold the line!"
  "Behind you!"
  "Regroup on me."
  "That was close."
  "Do not let them surround us."
)

TURN=0

# Re-login if we get a 401
relogin() {
  log "Token expired, re-logging in..."
  LOGIN_RESPONSE=$(curl -sf -X POST \
    -H "Content-Type: application/json" \
    -d "{\"username\": \"${USERNAME}\", \"password\": \"${PASSWORD}\"}" \
    "${SERVER_URL}/login") || { log "Re-login failed"; return 1; }
  TOKEN=$(echo "${LOGIN_RESPONSE}" | jq -r '.token')
  [[ -z "${TOKEN}" || "${TOKEN}" == "null" ]] && { log "Re-login returned no token"; return 1; }
  log "Re-logged in successfully."
}

log "Entering game loop (poll every ${POLL_INTERVAL}s). Ctrl+C to stop."
log "────────────────────────────────────────────────────────────────"

while true; do
  TURN=$((TURN + 1))

  # Poll for available actions
  ACTIONS_JSON=$(api_get "/api/v1/actions" 2>/dev/null) || {
    # Might be 401 (expired) or server down
    relogin 2>/dev/null || true
    sleep "${POLL_INTERVAL}"
    continue
  }

  # Check if we got a valid response
  if [[ -z "${ACTIONS_JSON}" ]] || ! echo "${ACTIONS_JSON}" | jq -e '.' >/dev/null 2>&1; then
    sleep "${POLL_INTERVAL}"
    continue
  fi

  # Check for error responses
  ERROR=$(echo "${ACTIONS_JSON}" | jq -r '.error // empty' 2>/dev/null)
  if [[ -n "${ERROR}" ]]; then
    log "Server: ${ERROR}"
    sleep "${POLL_INTERVAL}"
    continue
  fi

  # Extract available actions
  AVAILABLE=$(echo "${ACTIONS_JSON}" | jq -r '.actions // .available_actions // [] | .[]? // empty' 2>/dev/null)

  if [[ -z "${AVAILABLE}" ]]; then
    # No actions available — probably waiting for party or not our turn
    if (( TURN % 12 == 0 )); then
      log "Waiting... (no actions available, turn ${TURN})"
    fi
    sleep "${POLL_INTERVAL}"
    continue
  fi

  # Convert to array
  readarray -t ACTION_LIST <<< "${AVAILABLE}"
  NUM_ACTIONS=${#ACTION_LIST[@]}

  if [[ ${NUM_ACTIONS} -eq 0 ]]; then
    sleep "${POLL_INTERVAL}"
    continue
  fi

  # Pick a random action
  CHOSEN="${ACTION_LIST[$((RANDOM % NUM_ACTIONS))]}"

  log "[Turn ${TURN}] Available: ${NUM_ACTIONS} actions. Chose: ${CHOSEN}"

  # Execute the chosen action
  case "${CHOSEN}" in
    look)
      RESULT=$(api_get "/api/v1/look" 2>/dev/null) || true
      log "Looked around: $(echo "${RESULT}" | jq -r '.description // .room // "ok"' 2>/dev/null | head -c 120)"
      ;;

    get_status|status)
      RESULT=$(api_get "/api/v1/status" 2>/dev/null) || true
      HP=$(echo "${RESULT}" | jq -r '.hp.current // .hp // "?"' 2>/dev/null)
      log "Status check: HP=${HP}"
      ;;

    get_party|party)
      RESULT=$(api_get "/api/v1/party" 2>/dev/null) || true
      log "Checked party status."
      ;;

    get_inventory|inventory)
      RESULT=$(api_get "/api/v1/inventory" 2>/dev/null) || true
      log "Checked inventory."
      ;;

    attack)
      # We need a target — try to get one from room state or actions context
      TARGETS=$(echo "${ACTIONS_JSON}" | jq -r '.targets[]? // empty' 2>/dev/null)
      if [[ -n "${TARGETS}" ]]; then
        readarray -t TARGET_LIST <<< "${TARGETS}"
        TARGET="${TARGET_LIST[$((RANDOM % ${#TARGET_LIST[@]}))]}"
      else
        TARGET="nearest-enemy"
      fi
      RESULT=$(api_post "/api/v1/attack" "{\"target_id\": \"${TARGET}\"}" 2>/dev/null) || true
      log "Attacked ${TARGET}: $(echo "${RESULT}" | jq -r '.result // .message // "ok"' 2>/dev/null | head -c 100)"
      ;;

    cast)
      # Pick a spell — simple cantrip selection based on class
      case "${CHAR_CLASS}" in
        cleric)  SPELL="Sacred Flame" ;;
        wizard)  SPELL="Fire Bolt" ;;
        *)       SPELL="Fire Bolt" ;;
      esac
      TARGETS=$(echo "${ACTIONS_JSON}" | jq -r '.targets[]? // empty' 2>/dev/null)
      if [[ -n "${TARGETS}" ]]; then
        readarray -t TARGET_LIST <<< "${TARGETS}"
        TARGET="${TARGET_LIST[$((RANDOM % ${#TARGET_LIST[@]}))]}"
        RESULT=$(api_post "/api/v1/cast" "{\"spell_name\": \"${SPELL}\", \"target_id\": \"${TARGET}\"}" 2>/dev/null) || true
      else
        RESULT=$(api_post "/api/v1/cast" "{\"spell_name\": \"${SPELL}\"}" 2>/dev/null) || true
      fi
      log "Cast ${SPELL}: $(echo "${RESULT}" | jq -r '.result // .message // "ok"' 2>/dev/null | head -c 100)"
      ;;

    dodge)
      RESULT=$(api_post "/api/v1/dodge" "{}" 2>/dev/null) || true
      log "Dodging!"
      ;;

    dash)
      RESULT=$(api_post "/api/v1/dash" "{}" 2>/dev/null) || true
      log "Dashing!"
      ;;

    disengage)
      RESULT=$(api_post "/api/v1/disengage" "{}" 2>/dev/null) || true
      log "Disengaging."
      ;;

    help)
      RESULT=$(api_post "/api/v1/help" "{\"target_id\": \"nearest-ally\"}" 2>/dev/null) || true
      log "Helping an ally."
      ;;

    hide)
      RESULT=$(api_post "/api/v1/hide" "{}" 2>/dev/null) || true
      log "Attempting to hide."
      ;;

    move)
      DIRECTIONS=("north" "south" "east" "west" "forward" "nearest-enemy" "nearest-ally")
      DIR="${DIRECTIONS[$((RANDOM % ${#DIRECTIONS[@]}))]}"
      RESULT=$(api_post "/api/v1/move" "{\"direction_or_target\": \"${DIR}\"}" 2>/dev/null) || true
      log "Moved ${DIR}."
      ;;

    short_rest|short-rest)
      RESULT=$(api_post "/api/v1/short-rest" "{}" 2>/dev/null) || true
      log "Requesting short rest."
      ;;

    long_rest|long-rest)
      RESULT=$(api_post "/api/v1/long-rest" "{}" 2>/dev/null) || true
      log "Requesting long rest."
      ;;

    party_chat|chat)
      MSG=$(rand_element CHAT_LINES)
      RESULT=$(api_post "/api/v1/chat" "{\"message\": \"${MSG}\"}" 2>/dev/null) || true
      log "Said: \"${MSG}\""
      ;;

    whisper)
      MSG=$(rand_element CHAT_LINES)
      RESULT=$(api_post "/api/v1/whisper" "{\"player_id\": \"nearest-ally\", \"message\": \"${MSG}\"}" 2>/dev/null) || true
      log "Whispered: \"${MSG}\""
      ;;

    use_item|use-item)
      RESULT=$(api_post "/api/v1/use-item" "{\"item_id\": \"potion-of-healing\"}" 2>/dev/null) || true
      log "Used an item."
      ;;

    journal_add|journal)
      ENTRY="Turn ${TURN}. We press on. The dungeon tests us but we endure."
      RESULT=$(api_post "/api/v1/journal" "{\"entry\": \"${ENTRY}\"}" 2>/dev/null) || true
      log "Wrote journal entry."
      ;;

    queue|queue_for_party)
      RESULT=$(api_post "/api/v1/queue" "{}" 2>/dev/null) || true
      log "Re-queued for party."
      ;;

    *)
      log "Unknown action: ${CHOSEN} — skipping."
      ;;
  esac

  sleep "${POLL_INTERVAL}"
done
