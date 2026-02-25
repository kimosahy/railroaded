# Railroaded.ai Testing - Sylith Dra'kenn Session

## Test Session Info
- Character: Sylith Dra'kenn (Dark Elf Wizard, Level 1)
- Date: 2026-02-24
- Tester: Poormetheus (AI Testing Agent)

## Bugs Found

### 1. Search Action Returns 404
- **Issue**: `/api/v1/search` endpoint returns "404 Not Found" despite being listed in availableActions
- **Expected**: Should return search results or "nothing found" message
- **Actual**: 404 error
- **Severity**: Medium (core exploration feature broken)

### 2. Long Chat Messages Cause Internal Server Error
- **Issue**: Chat messages over ~100 characters cause "Internal Server Error"
- **Tested Message**: Long roleplay text with quotes and asterisks
- **Working Message**: Short messages like "Expect guards ahead."
- **Severity**: Medium (limits roleplay quality)

### 3. Combat Turn System Unclear
- **Issue**: No clear indication of turn order or when player turn will occur
- **Current**: Shows isYourTurn:false but no ETA or turn order
- **Needed**: Turn order display, estimated wait time, or turn counter
- **Severity**: Low (playability issue)

## Features Working Well

### API Responses
- ✅ /api/v1/look - Provides good room details
- ✅ /api/v1/status - Complete character stats
- ✅ /api/v1/actions - Lists available actions correctly
- ✅ /api/v1/move - Movement works smoothly
- ✅ /api/v1/chat - Short messages work fine
- ✅ /api/v1/inventory - Shows equipment and items
- ✅ /api/v1/party - Party information complete

### Game Flow
- ✅ Room transitions work
- ✅ Combat detection and phase switching works
- ✅ Character stats and conditions tracking
- ✅ Monster spawning in appropriate rooms

### 4. Multiple Endpoints Return 404 Despite Being Listed
- **Issue**: Many endpoints in availableActions return 404 Not Found
- **Broken Endpoints**: 
  - `/api/v1/search` (404)
  - `/api/v1/use_item` (404) 
  - `/api/v1/short_rest` (404)
- **Working Alternative**: `/api/v1/whisper` works (though response format is odd)
- **Severity**: High (major feature set broken)

### 5. Combat Turn System Appears Stuck
- **Issue**: Combat phase entered but isYourTurn never becomes true
- **Duration Tested**: 20+ seconds of polling
- **Expected**: Turn should advance or provide turn order info
- **Impact**: Cannot test combat actions
- **Severity**: High (core gameplay broken)

### 6. Parameter Parsing Issues in Combat Actions
- **Issue**: Attack and spell endpoints show "undefined" in error messages
- **Tested**: `{"target": "skeleton A"}` → "Target undefined not found"
- **Tested**: `{"target": "monster-1"}` → "Target undefined not found"  
- **Tested**: `{"spell": "Magic Missile"}` → "Unknown spell: undefined"
- **Severity**: High (suggests JSON parsing bug)

### 7. Room State Inconsistency 
- **Issue**: Room location inconsistent between API calls
- **Example**: Move says in Guard Room, Look shows Entrance Hall
- **Impact**: Navigation and spatial awareness broken
- **Severity**: Medium (confusing but not blocking)

### 8. Whisper API Response Format Issue
- **Issue**: Whisper response shows "from" field but not "to" field
- **Expected**: Should show both sender and recipient
- **Impact**: Unclear if whisper reached intended target
- **Severity**: Low (functional but unclear)

## Features Working Well

### API Responses
- ✅ /api/v1/look - Provides room details (though location inconsistent)
- ✅ /api/v1/status - Complete character stats
- ✅ /api/v1/actions - Lists available actions (though many 404)
- ✅ /api/v1/move - Movement works for basic cases
- ✅ /api/v1/chat - Short messages work fine
- ✅ /api/v1/inventory - Shows equipment and items
- ✅ /api/v1/party - Party information complete
- ✅ /api/v1/whisper - Functional (formatting issues noted)

### Game Flow
- ✅ Room transitions work (with caveats about state consistency)
- ✅ Combat detection and phase switching works
- ✅ Character stats and conditions tracking
- ✅ Monster spawning and tracking

## Still Testing (Blocked)
- Combat actions (turn system stuck)
- Spellcasting mechanics (parameter parsing broken)
- Item usage (endpoint returns 404)
- Rest mechanics (endpoint returns 404)

## Test Session Summary

**Total Test Duration**: ~25 minutes
**Character Actions Attempted**: 15+ API calls
**Major Bugs Found**: 8 distinct issues
**Blocking Issues**: 4 (preventing core gameplay)

The platform shows promise with working basic movement, character stats, and simple chat functionality. However, several critical systems are broken:
- Combat turn mechanics completely non-functional  
- Multiple core actions return 404 despite being listed as available
- JSON parameter parsing appears fundamentally broken
- Room state synchronization issues

**Overall Assessment**: Alpha stage - core functionality broken, needs significant debugging before viable gameplay.

## Recommendations
1. **Critical**: Fix combat turn system - currently blocks all combat testing
2. **Critical**: Fix 404 endpoints that are listed in availableActions  
3. **Critical**: Debug JSON parameter parsing (all "undefined" errors suggest systemic issue)
4. **High**: Resolve room state synchronization issues
5. **Medium**: Add better error messages with examples of correct format
6. **Low**: Fix whisper response format to show target

**Next Testing Phase**: Recommended after combat and parameter parsing issues resolved.