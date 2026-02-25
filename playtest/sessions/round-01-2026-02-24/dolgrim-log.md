# Dolgrim's Test Session - Bug Report

**Session Started:** Tue 2024-02-24 18:45 UTC  
**Character:** Dolgrim Stonehew (char-4)  
**Server:** https://api.railroaded.ai  

## Bugs and Issues Found:

### 1. **Room Data Inconsistency**
- **Issue:** Initial `/api/v1/look` showed exit to "Guard Room" from "Entrance Hall"
- **Problem:** When trying `/api/v1/move` with "Guard Room", got error saying available exits were "Entrance Hall, Boss Chamber"  
- **Result:** Move actually succeeded despite error message - ended up in Guard Room
- **Severity:** Medium - Confusing UX, misleading error messages

### 2. **Combat Turn Progression Issue**  
- **Issue:** Entered combat phase with 3 skeletons in Guard Room
- **Problem:** `isYourTurn` remains `false` after multiple polls (30+ seconds)
- **Available Actions:** Only "party_chat", "get_status", "get_available_actions" 
- **Expected:** Turn should eventually rotate to player characters
- **Severity:** High - Blocks gameplay progression

### 3. **Search Action Not Working**
- **Issue:** Tried POST to `/api/v1/action` with `{"action": "search"}`
- **Result:** 404 Not Found
- **Expected:** Should be able to search rooms during exploration
- **Note:** Maybe wrong endpoint or format?
- **Severity:** Medium - Feature not accessible

## Character Status:
- Level 1 Dwarf Cleric
- HP: 12/12
- Spell Slots: 2/2 Level 1
- Equipment: Mace, Chain Shirt, Shield
- Party: Brog (Fighter), Sylith (Wizard), Wren (Rogue) - all healthy

## API Endpoints Tested:
- ✅ `/api/v1/look` - Works (but has room consistency issues)
- ✅ `/api/v1/actions` - Works  
- ✅ `/api/v1/status` - Works
- ✅ `/api/v1/chat` - Works well
- ✅ `/api/v1/inventory` - Works, shows equipment and items
- ⚠️ `/api/v1/move` - Works but gives misleading error messages
- ⚠️ `/api/v1/attack` - Exists but "Target undefined" error
- ❌ `/api/v1/action` - 404 for any action type
- ❌ `/api/v1/use_item` - 404
- ❌ `/api/v1/get_party` - 404

## Notes:
- Chat/roleplay functionality works well
- JSON responses are clean and well-formatted
- Authentication working properly
- Party data updates correctly

### 4. **Room Location Bug**
- **Issue:** Started in Entrance Hall, moved to Guard Room, but `/api/v1/look` now shows back in Entrance Hall 
- **Problem:** Room state seems inconsistent - monsters that were in Guard Room are now in Entrance Hall
- **Expected:** Should stay in Guard Room where combat started
- **Severity:** High - Confusing spatial consistency

### 5. **Combat Action Endpoint Issues**
- **Issue:** `/api/v1/action` returns 404 for any combat actions
- **Tried:** `{"action": "attack", "target": "skeleton A"}`
- **Alternative:** `/api/v1/attack` exists but returns `"Target undefined not found"`
- **Tried Targets:** "skeleton A", "monster-1" (both valid from look data)
- **Severity:** High - Cannot perform combat actions

### 6. **Missing API Endpoints**
- **Issue:** Several endpoints from available actions return 404:
  - `/api/v1/get_party` - 404
  - `/api/v1/action` - 404  
- **Expected:** These should work based on available actions list
- **Severity:** Medium - Reduced functionality

## FINAL SUMMARY

**Session Completed:** Successfully tested roleplay and basic navigation  
**Major Issues:** Combat system non-functional, several API endpoints missing or broken  
**Positive Aspects:** Chat, look, status, and move endpoints work. Character data is persistent and accurate.

**Recommended Fixes:**
1. Fix combat turn progression - players never get their turn
2. Resolve room location consistency issues  
3. Fix attack targeting system - "Target undefined" error
4. Implement missing endpoints (use_item, get_party, action)
5. Improve error messages for move command

**Overall Assessment:** Platform has good foundation for roleplay but combat system needs significant work. Authentication and basic game state management work well.

**Current Status:** Testing completed - fundamental combat system issues prevent full gameplay experience.