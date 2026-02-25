# Brog's Bug Report for Railroaded.ai Testing

**Test Character:** Brog Ironwall (char-3)
**Test Date:** February 24, 2026
**Tester:** AI Agent playing in-character

## Major Issues Found

### 1. Combat Turn System Stuck - CRITICAL BUG
- **Problem:** Combat phase initiated but player never gets a turn
- **Reproduction:**
  1. Started in Entrance Hall
  2. Made chat messages asking where to go
  3. Combat phase suddenly activated (room changed to Boss Chamber, then Guard Room)
  4. Three skeletons appeared (skeleton A, B, C)
  5. API shows `"isYourTurn":false` consistently
  6. Waited over 5 minutes, turn never comes
  7. Available actions limited to: party_chat, get_status, get_available_actions

- **Expected:** Turn-based combat should cycle through all participants
- **Actual:** Player character stuck waiting indefinitely for turn
- **Impact:** Game unplayable - cannot engage in combat at all

### 2. Inconsistent Room State
- **Problem:** Room location changed without clear player action
- **Details:** 
  - Started in "Entrance Hall" 
  - Suddenly appeared in "Boss Chamber" with enemies
  - Then moved to "Guard Room" 
  - Same enemies present in all locations
- **Expected:** Clear transitions or explanations for room changes
- **Actual:** Mysterious room changes without player input

### 3. Combat Initiation Unclear
- **Problem:** Combat started without clear trigger
- **Details:** Was in exploration phase, made some chat messages, suddenly in combat
- **Expected:** Clear indication of what triggers combat
- **Actual:** Combat began unexpectedly

## API Endpoints Tested

✅ GET /api/v1/look - Works, returns room info
✅ GET /api/v1/actions - Works, returns available actions  
✅ POST /api/v1/chat - Works, sends party messages
✅ GET /api/v1/status - Works, returns character stats
❌ Combat actions - Cannot test due to turn system bug

## Character Stats (Working)
- Brog Ironwall, Level 1 Human Fighter
- HP: 13/13, AC: 18
- STR: 18, DEX: 11, CON: 17, INT: 8, WIS: 13, CHA: 12
- Equipment: Longsword, Chain Mail, Shield
- Features: Extra Skill Proficiency, Fighting Style, Second Wind

## Party Members (All Present)
- Dolgrim Stonehew (cleric) - healthy
- Brog Ironwall (fighter) - healthy  
- Sylith Dra'kenn (wizard) - healthy
- Wren Ashvale (rogue) - healthy

## Authentication
- Bearer token authentication working properly
- All API calls successful (no 401/403 errors)

## Recommendations
1. **URGENT:** Fix combat turn system - this blocks all combat gameplay
2. Make room transitions more explicit and logical
3. Add clear combat initiation triggers/warnings
4. Consider adding timeout or "skip turn" mechanics if a player is unresponsive

## Additional Issues Found

### 4. Incomplete Available Actions List - CRITICAL BUG
- **Problem:** Available actions endpoint severely incomplete during combat
- **Details:** 
  - Available actions reported: ["party_chat","get_status","get_available_actions"]
  - But these actions actually work (discovered through testing):
    - ✅ `/api/v1/move` - Can move between rooms during combat
    - ✅ `/api/v1/dodge` - Returns "Brog Ironwall takes the Dodge action"
    - ✅ `/api/v1/help` - Returns "Brog Ironwall helps an ally"
    - ❌ `/api/v1/attack` - Exists but target resolution fails
- **Expected:** All functional actions should be listed in available actions
- **Actual:** Critical combat actions missing from available actions list
- **Impact:** Players won't know they can take most combat actions!

### 5. Attack Endpoint Target Resolution Bug  
- **Problem:** Attack endpoint can't find valid targets
- **Details:**
  - Tried attacking "monster-1" and "skeleton A" 
  - Both return "Target undefined not found or already dead"
  - But `look` command shows skeletons as "alive"
- **Expected:** Should be able to attack live enemies with proper target names
- **Actual:** Target resolution failing

### 6. Movement During Combat (Unclear if Bug)
- **Behavior:** Can move during combat, enemies follow to new room
- **Details:** Moved from Guard Room to Entrance Hall, all 3 skeletons followed
- **Question:** Is this intended behavior? Seems realistic but unclear

## Test Progression
1. ✅ Started in Entrance Hall - room data loaded correctly
2. ✅ Chat system working - sent party messages  
3. ✅ Character status retrieved - stats look correct
4. ❌ Combat initiated unexpectedly - phase changed without clear trigger
5. ❌ Combat turn system stuck - never got a turn despite waiting 5+ minutes
6. ✅ Movement during combat works - but not listed as available action
7. ✅ Dodge action works - but not listed as available action  
8. ✅ Help action works - but not listed as available action
9. ❌ Attack system broken - can't target visible enemies despite them being "alive"
10. ❌ Combat never resolved - still stuck in combat phase

## Critical Discovery
**The available actions API is fundamentally broken during combat.** It only reports 3 actions but many more actually work. This means players don't know what they can do, making the game essentially unplayable even when the underlying systems might work.

## Priority Fix Recommendations
1. **URGENT:** Fix `/api/v1/actions` to report ALL working actions during combat
2. **URGENT:** Fix attack target resolution (monsters visible but can't be targeted)  
3. **HIGH:** Investigate combat turn system - unclear if it's truly broken or just poorly communicated
4. **MEDIUM:** Clarify combat initiation triggers
5. **LOW:** Document movement during combat behavior

**Test Status:** PARTIALLY COMPLETE - Found major API discovery issue and attack targeting bug
**Severity:** CRITICAL - Available actions API gives false information, making game appear broken when some features actually work

**Final Note:** Brog tried his best to test but the combat system is very confusing. Smart people should look at these bugs. Brog hopes this helps make game better for future players.