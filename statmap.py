"""Map a source /competition/<cid>/person/<pid>/statistics row to a persons.json
line: field 0 is the TEAM, then the 40 PF_KEYS in order. The page interleaves
per-game columns; only the season-total columns are kept."""
PF_KEYS = ['blkr','index','gmsc','fga','fgm','flson','pf','unsf','fta','ftm','gs','l','pa','min',
           'offrat','pfor','twocp','posspg','dreb','drpct','oreb','orpct','stpct','tpa','tpm','tsa',
           'tspct','tov','topct','twopa','twopm','w','pm','g','pts','ast','reb','stl','blk','eff']
SRC = {'BLKR':'blkr','Index':'index','Gm Sc':'gmsc','FGA':'fga','FGM':'fgm','Fls On':'flson',
       'Tot Fouls':'pf','Uns. Foul':'unsf','FTA':'fta','FTM':'ftm','GS':'gs','Losses':'l','-':'pa',
       'Mins':'min','Off Rat':'offrat','+':'pfor','2CP':'twocp','Poss PG':'posspg','DEF':'dreb',
       'DR%':'drpct','OFF':'oreb','OR%':'orpct','ST%':'stpct','3PA':'tpa','3PM':'tpm','TSA':'tsa',
       'TS%':'tspct','TO':'tov','TO%':'topct','2PA':'twopa','2PM':'twopm','Wins':'w','+/-':'pm',
       'G':'g','PTS':'pts','AST':'ast','REB':'reb','STL':'stl','BLK':'blk','EFF':'eff'}
assert sorted(SRC.values()) == sorted(PF_KEYS)
def to_line(heads, row):
    ix = {h: i for i, h in enumerate(heads)}
    team = row[ix['Team']]
    return '\t'.join([team] + [row[ix[k]] for k in [next(s for s, v in SRC.items() if v == f) for f in PF_KEYS]])
