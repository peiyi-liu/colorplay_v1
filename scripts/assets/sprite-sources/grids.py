"""Hand-authored pixel grids for ColorPlay JRPG style probes (round 1).

One char per pixel. '.' = transparent. Legend maps chars to the 29-color
palette in scripts/assets/pixel-palette.json. Light source: top-left.
Outline: '#18212f' (o) / deep '#10142e' (n).
"""

LEGEND = {
    "o": "#18212f",  # outline
    "n": "#10142e",  # deep navy (mouth interior / face shadow)
    "N": "#171c3f",  # navy 2 (village back layer)
    "s": "#565c82",  # slate
    "a": "#a9b0d6",  # light slate
    "c": "#f4f1e4",  # cream (wings)
    "W": "#ffffff",  # white (glints)
    "F": "#f6eed8",
    "Y": "#fdf8ea",
    "m": "#e3d5b3",  # parchment (chest inlay)
    "w": "#6b4a26",  # wood base
    "d": "#4a3118",  # wood shadow
    "g": "#f5c400",  # gold bright
    "b": "#b8862f",  # gold mid
    "k": "#8a651f",  # gold dark / wood highlight
    "r": "#c73a3f",  # coral red base
    "e": "#e5484d",  # red light
    "h": "#ff8a8d",  # pink highlight
    "f": "#ff8b75",  # salmon (blush)
    "B": "#3056d8",  # blue base
    "V": "#2542ad",  # blue shadow
    "U": "#6c8ff8",  # blue highlight
    "G": "#22a06b",  # green base
    "D": "#17754e",  # green shadow
    "L": "#48cfa5",  # green highlight
    "p": "#d976e8",
    "x": "#ff8450",
    "C": "#39b8df",  # cyan base
}

GRIDS = {}

# ---------------------------------------------------------------- spirits 16x16

# spirit-1: round blob with eyes, tiny gold horn, blush cheeks
GRIDS["spirit-1"] = [
    "................",
    ".......oo.......",
    "......ogbo......",
    "....ooogbooo....",
    "...ohhheeerro...",
    "..ohhheeerrrro..",
    "..ohheeerrrrro..",
    ".ohheeerrrrrrro.",
    ".oheWorrrWorrro.",
    ".oeroorrroorrro.",
    ".orffrroorrffro.",
    "..orrrrrrrrrro..",
    "..orrrrrrrrrro..",
    "...orrrrrrrro...",
    "....oooooooo....",
    "................",
]

# spirit-2: winged wisp - round head, cream wings, trailing wavy tail
GRIDS["spirit-2"] = [
    ".......o........",
    "......ogo.......",
    ".....oogooo.....",
    "....ohheeero....",
    ".o.ohheeerrro.o.",
    ".ocoheeerrrroco.",
    "occoeorrrrorocco",
    ".ocoeorrrroroco.",
    "....orrrrrro....",
    ".....orrrro.....",
    "......orro......",
    ".......orro.....",
    "........oro.....",
    ".......oro......",
    "........o.......",
    "................",
]

# spirit-3: hooded sprite - red hood, dark face window, glowing white eyes
GRIDS["spirit-3"] = [
    ".......o........",
    "......ogo.......",
    ".....oogooo.....",
    "....ohheeero....",
    "...ohheeerrro...",
    "...oheeerrrro...",
    "..oernnnnnnrro..",
    "..ornnWnnWnrro..",
    "..ornnnnnnnrro..",
    "..orrrrrrrrrro..",
    "..oeerrrrrrrro..",
    "..oeerrrrrrrro..",
    ".oeerrrrrrrrrro.",
    ".oeergrrgrrgrro.",
    ".oooooooooooooo.",
    "................",
]

# spirit-4: flame-like - flickering silhouette, pink core, side horn nub
GRIDS["spirit-4"] = [
    ".........o......",
    "........oeo.....",
    ".......oeeo.....",
    "....oeoeeeeo....",
    "....oeehheeo....",
    "..ogoehhhheeo...",
    "...oehhhhheeo...",
    "...oeohhhhoeo...",
    "...oeohhhhoeo...",
    "..oehhhhhhheeo..",
    "..oehhhoohheeo..",
    "..oeehhhhheeeo..",
    "...oeerrrreeo...",
    "....orrrrrro....",
    ".....oooooo.....",
    "................",
]

# --------------------------------------------------------------- monsters 32x32

# monster-1: classic drip slime (green) - dome, big oval eyes, wide smile,
# three drips under the base
GRIDS["monster-1"] = [
    "................................",
    "................................",
    "................................",
    "................................",
    "................................",
    "................................",
    "..............ooooo.............",
    "............oLLLGGGo............",
    "...........oLWWLLGGGo...........",
    "..........oLLWWLGGGGGo..........",
    ".........oLLLLGGGGGGGDo.........",
    "........oLLLGGGGGGGGGDDo........",
    ".......oLLWooGGGGGGWooDDo.......",
    "......oLLGoooGGGGGGoooGDDo......",
    "......oLGGoooGGGGGGoooGGDo......",
    ".....oLGGGoooGGGGGGoooGGGDo.....",
    ".....oLGGGGGGGGGGGGGGGGGDDo.....",
    "....oGGGGGGGoGGGGGGoGGGGGDDo....",
    "....oGGGGGGGGooooooGGGGGGDDo....",
    "....oGGGGGGGGGGGGGGGGGGGGDDo....",
    "...oGGGGGGGGGGGGGGGGGGGGGDDDo...",
    "...oGGGGGGGGGGGGGGGGGGGGGDDDo...",
    "...oGGGGGGGGGGGGGGGGGGGGDDDDo...",
    "..oGGGGGGGGGGGGGGGGGGGGGGDDDDo..",
    "..oGGGGGGGGGGGGGGGGGGGGDDDDDDo..",
    "..oooDDDooooooDDDDooooooDDDooo..",
    "....oDGDo....oDGGDo....oDGDo....",
    ".....ooo......oDDo......oDo.....",
    "...............oo........o......",
    "................................",
    "................................",
    "................................",
]

# monster-2: round blob slime (blue) - perfectly round, open happy mouth,
# lighter cheek spots
GRIDS["monster-2"] = [
    "................................",
    "................................",
    "................................",
    "................................",
    "................................",
    "................................",
    "..............ooooo.............",
    "............oUUUBBBo............",
    "...........oUWWUBBBBo...........",
    "..........oUWWUBBBBBBo..........",
    ".........oUUUBBBBBBBVVo.........",
    "........oUUBBBBBBBBBBVVo........",
    ".......oUUBWoBBBBBBWoBVVo.......",
    "......oUUBBWoBBBBBBWoBBVVo......",
    "......oUBBBooBBBBBBooBBVVo......",
    ".....oUBBBBooBBBBBBooBBBVVo.....",
    ".....oUBUUBBBBBBBBBBBBUUVVo.....",
    "....oBBBBBBBBooooooBBBBBBVVo....",
    "....oBBBBBBBonnnnnnoBBBBBVVo....",
    "....oBBBBBBBBonnnnoBBBBBBVVo....",
    "...oBBBBBBBBBBooooBBBBBBBBVVo...",
    "...oBBBBBBBBBBBBBBBBBBBBBVVVo...",
    "...oBBBBBBBBBBBBBBBBBBBBBVVVo...",
    "..oBBBBBBBBBBBBBBBBBBBBBBVVVVo..",
    "..oBBBBBBBBBBBBBBBBBBBBBVVVVVo..",
    "..oBBBBBBBBBBBBBBBBBBVVVVVVVVo..",
    "...oBBBBBBBBBBBBBBVVVVVVVVVVo...",
    "....oooooooooooooooooooooooo....",
    "................................",
    "................................",
    "................................",
    "................................",
]

# monster-3: spiky slime (cyan) - three head spikes, side spikes, slanted
# brows, zigzag grin with two fangs
GRIDS["monster-3"] = [
    "................................",
    "................................",
    "...............o................",
    "..............oCo...............",
    ".........o....oCo....o..........",
    "........oCo...oCo...oCo.........",
    "........oCo..oCCo...oCo.........",
    ".......oCCo..oCCCo.oCCo.........",
    ".......oCCo.oCCCCo.oCCo.........",
    "........oCCCCCCCCCCCCCo.........",
    "........oCWWCCCCCCCCCBBo........",
    ".......oCWWCCCCCCCCCCCBBo.......",
    "......oCCCCCCCCCCCCCCCBBBo......",
    ".....oCCooCCCCCCCCCCCCooBBo.....",
    ".....oCCCooCCCCCCCCCCooCBBo.....",
    ".oCCCCCCCCooCCCCCCCCooCCCBBBBBo.",
    "..oooCCCCCCooCCCCCCooCCCCBBoo...",
    "....oCCCCCCCCCCCCCCCCCCCBBBo....",
    "....oCCCCCCooooooooooCCCBBBo....",
    "....oCCCCCCCWCCCCCCWCCCCCBBo....",
    "....oCCCCCCCCCCCCCCCCCCCBBBo....",
    "....oCCCCCCCCCCCCCCCCCCCBBBo....",
    "....oCCCCCCCCCCCCCCCCCCCBBBo....",
    "...oCCCCCCCCCCCCCCCCCCCCBBBBo...",
    "...oCCCCCCCCCCCCCCCCCCCCBBBBo...",
    "...oCCCCCCCCCCCCCCCCCCBBBBBBo...",
    "...oCCCCCCCCCCCCCCBBBBBBBBBBo...",
    "...oooooooooooooooooooooooooo...",
    "................................",
    "................................",
    "................................",
    "................................",
]

# monster-4: crowned slime (green) - gold three-point crown with red jewel,
# closed content eyes, small smile, light cheeks
GRIDS["monster-4"] = [
    "................................",
    "................................",
    "................................",
    "...........o...o...o............",
    "..........ogo.ogo.ogo...........",
    "..........oggggggggggo..........",
    "..........oggggeeggbbo..........",
    "..........oggggeegbbbo..........",
    "..........oooooooooooo..........",
    "............oLLGGGGo............",
    "...........oLLLGGGGGo...........",
    "..........oLLLGGGGGGDo..........",
    "........oLLLGGGGGGGGGDDo........",
    ".......oLLGGGGGGGGGGGGDDo.......",
    "......oLGGooGGGGGGGGooGGDo......",
    ".....oLGGoGGoGGGGGGoGGoGGDo.....",
    ".....oLGGGGGGGGGGGGGGGGGDDo.....",
    "....oLGGGGGGoGGGGGGoGGGGGDDo....",
    "....oLGGGGGGGooooooGGGGGGDDo....",
    "...oGGGGGGGGGGGGGGGGGGGGGDDDo...",
    "...oGGGGGGGGGGGGGGGGGGGGGDDDo...",
    "...oGGGGGGGGGGGGGGGGGGGGDDDDo...",
    "...oGGGGGGGGGGGGGGGGGGGDDDDDo...",
    "...oGGGGGGGGGGGGGGGGGGGDDDDDo...",
    "...oGGGGGGGGGGGGGGGGDDDDDDDDo...",
    "....oGGGGGGGGGGGGDDDDDDDDDDo....",
    ".....oooooooooooooooooooooo.....",
    "................................",
    "................................",
    "................................",
    "................................",
    "................................",
]

# ---------------------------------------------------------------- chests 24x20

# chest-1: banded - vertical gold bands, flat-ish lid, 5-wide lock plate
GRIDS["chest-1"] = [
    "........................",
    "..oooooooooooooooooo....",
    ".okkggkkkkkkkkkkkkggko..",
    ".owwggwwwwwwwwwwwwggwo..",
    ".owwggwwwwwwwwwwwwggwo..",
    ".owwggwwwwwwwwwwddggdo..",
    ".oooooooooooooooooooooo.",
    ".owwggwwwwooooowwwggwwo.",
    ".owwggwwwwogbbowwwggwwo.",
    ".owwggwwwwobobowwwggwwo.",
    ".owwggwwwwobobowwwggwwo.",
    ".owwggwwwwooooowwwggwwo.",
    ".owwggwwwwwwwwwwwwggwwo.",
    ".owwggwwwwwwwwwwwwggwwo.",
    ".owwggwwwwwwwwwwwwggwwo.",
    ".oddbbddddddddddddbbddo.",
    ".oddbbddddddddddddbbddo.",
    ".oooooooooooooooooooooo.",
    "..ooo..............ooo..",
    "........................",
]

# chest-2: rounded lid - domed top, gold rim line at the seam, plain body
GRIDS["chest-2"] = [
    "......oooooooooooo......",
    "....ookkkkkkkkkkkkoo....",
    "..ookkkkkkwwwwwwwwwwoo..",
    "..okkkkwwwwwwwwwwwwwwo..",
    ".okkwwwwwwwwwwwwwwwdddo.",
    ".okwwwwwwwwwwwwwwddddwo.",
    ".oggggggggggggggggbbbbo.",
    ".oooooooooooooooooooooo.",
    ".owwwwwwwwooooowwwwwwwo.",
    ".owwwwwwwwogbbowwwwwwwo.",
    ".owwwwwwwwobobowwwwwwwo.",
    ".owwwwwwwwobobowwwwwwwo.",
    ".owwwwwwwwooooowwwwwwwo.",
    ".owwwwwwwwwwwwwwwwwdddo.",
    ".owwwwwwwwwwwwddddddddo.",
    ".oddddddddddddddddddddo.",
    ".oooooooooooooooooooooo.",
    "..ooo..............ooo..",
    "........................",
    "........................",
]

# chest-3: flat lid - shallow slab lid, metal hinges, 6-wide lock plate,
# plank seams
GRIDS["chest-3"] = [
    "........................",
    "........................",
    ".oooooooooooooooooooooo.",
    ".okkkkkkkkkkkkkkkkkkkko.",
    ".okkwwwwwwwwwwwwwwwwddo.",
    ".oooooooooooooooooooooo.",
    ".owwbbwwwwwwwwwwwwbbwwo.",
    ".owwwwwwwooooooowwwwwwo.",
    ".owwwwwwwogbbbbowwwwwwo.",
    ".owwwwwwwoboobbowwwwwwo.",
    ".owwwwwwwoboobbowwwwwwo.",
    ".owwwwwwwobbbbbowwwwwwo.",
    ".owwwwwwwooooooowwwwwwo.",
    ".owwwwdwwwwwwwwwwdwwwwo.",
    ".owwwwdwwwwwwwwwwdwwwwo.",
    ".oddddddddddddddddddddo.",
    ".oooooooooooooooooooooo.",
    "..ooo..............ooo..",
    "........................",
    "........................",
]

# chest-4: ornate - rounded gold-ridged lid, corner caps, cream inlay panel,
# large gold plate
GRIDS["chest-4"] = [
    ".......oooooooooo.......",
    "....ookkkkkggkkkkkoo....",
    "..ookkkkkkkggkkkkkkkoo..",
    ".oggbwwwwwwggwwwwwwbggo.",
    ".ogbwwwwwwwggwwwwwwwbgo.",
    ".ogwwwwwwwwwwwwwwwwwwgo.",
    ".obbggggggggggggggggbbo.",
    ".oooooooooooooooooooooo.",
    ".owwwwwwwooooooowwwwwwo.",
    ".owwwmmmmoggbbbommmmwwo.",
    ".owwwmmmmogoogbommmmwwo.",
    ".owwwmmmmogoogbommmmwwo.",
    ".owwwmmmmobggbbommmmwwo.",
    ".owwwmmmmooooooommmmwwo.",
    ".ogbwwwwwwwwwwwwwwwwbgo.",
    ".ogbddddddddddddddddbgo.",
    ".oooooooooooooooooooooo.",
    "..ooo..............ooo..",
    "........................",
    "........................",
]
