-- Map-specific stubs: Natives this Map project calls that the reforged-test
-- stubs do not define. The harness loads every tests/stubs/*.lua file after
-- the package's stubs. Plain Lua 5.3; each stub records its call like the
-- package's stubs do. Never edit the package's stub files.

-- The harness's units carry no name, so a unit answers the rawcode
-- CreateUnit was given: FourCC("hfoo") -> "hfoo".
function GetUnitName(whichUnit)
  __stub_record("GetUnitName", whichUnit)
  return string.pack(">I4", whichUnit.typeId)
end
