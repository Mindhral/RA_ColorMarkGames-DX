// ==UserScript==
// @name        RA_ColorMarkGames
// @description Colors Game Names
// @version     1.2
// @namespace   RA
// @match       https://retroachievements.org/game/*
// @match       https://retroachievements.org/gameSearch*
// @match       https://retroachievements.org/gameList.php*
// @match       https://retroachievements.org/user/*
// @match       https://retroachievements.org/viewtopic.php?t=*
// @match       https://retroachievements.org/setRequestList.php?u=*
// @match       https://retroachievements.org/controlpanel.php*
// @match       https://retroachievements.org/system/*/games*
// @run-at      document-start
// @icon        https://static.retroachievements.org/assets/images/favicon.webp
// @grant       GM_setValue
// @grant       GM_deleteValue
// @grant       GM_getValue
// @author      Xymjak
// @author      Mindhral
// @noframes
// ==/UserScript==

const DefaultTextColors = {
    Default: '',
    Played: '#4270E0',
    Started: '#80C0F0',
    Halfway: '#4270E0',
    Mastered: '#808080',
    Ignored: '#703030',
    NoSet: '#305050',
    SmallSet: '#10B0B0',
    Hub: '#20C0C0'
};
// Played = Started + Halfway
const DefaultSortOrder = ['Default', 'Started', 'Halfway', 'Mastered', 'Ignored', 'SmallSet', 'Hub', 'NoSet'];
const Settings = {
    TextColors: GM_getValue('textColors', DefaultTextColors),
    SortOrder: GM_getValue('sortOrder', DefaultSortOrder),
    SmallSetThr: GM_getValue('smallSetThr', 25),
    ShowProgressFor100PercentUnlocks: GM_getValue('showProgressFor100PercentUnlocks', true),
    UseHardcoreProgression: GM_getValue('useHardcoreProgression', false),
    ColorHubLines: GM_getValue('colorHubLines', true),
    SortHubLines: GM_getValue('sortHubLines', true),
    ColorProgressLines: GM_getValue('colorProgressLines', true),
    ColorSetRequestLines: GM_getValue('colorSetRequestLines', true),
    SortSetRequestLines: GM_getValue('sortSetRequestLines', true)
};

// TODO: Ignored from the site interface

const PageTypes = { developer: 'd', consoles: 'c', all: 'a', hardest: 'h', toplay: 't', hubs: 'u', unknown: 'k' };

const UI = (() => {
    const CreateCheckbox = id => {
        const input = document.createElement('input');
        input.type = 'checkbox';
        input.id = id;
        return input;
    };

    const CreateLabel = (id, text) => {
        const label = document.createElement('label');
        label.for = id;
        label.innerText = text;
        return label;
    };

    return { CreateCheckbox, CreateLabel };
})();

const GetUrlParam = param => {
    const urlParams = window.location.search.substring(1).split('&');
    for (let i = 0; i < urlParams.length; i++) {
        const urlParam = urlParams[i].split('=', 2);
        if (urlParam[0] === param) return urlParam[1];
    }
    return undefined;
};

const Data = (() => {
    let _ignored; let _progress;

    const LoadObjStorage = storage => (storage ? JSON.parse(storage) : {});
    const LoadArrStorage = storage => (storage ? JSON.parse(storage) : []);
    const LoadManualIntArrStorage = storage => storage?.split(',').map(Number).filter(Number.isInteger) || [];

    const SaveProgress = () => { localStorage.MarkProgress = JSON.stringify(_progress); };
    const LoadProgress = () => { _progress = LoadObjStorage(localStorage.MarkProgress); };
    const SaveIgnored = () => { localStorage.MarkIgnored = JSON.stringify([..._ignored]); };

    const LoadIgnored = () => {
        const Manual = (ignored, mode) => {
            const key = `Ignored_${mode}`;
            LoadManualIntArrStorage(localStorage[key]).forEach(ignored[mode], ignored);
            localStorage[key] = ''; // instead of delete for auto-complete in browser's console
            return ignored;
        };

        _ignored = Manual(Manual(new Set(LoadArrStorage(localStorage.MarkIgnored)), 'add'), 'delete');
        SaveIgnored();
    };

    return {
        IgnoredGet() { if (!_ignored) LoadIgnored(); return _ignored; },
        IgnoredSet(ignored) { _ignored = ignored; SaveIgnored(); },
        ProgressGet() { if (!_progress) LoadProgress(); return _progress; },
        ProgressSet(progress) { _progress = progress; SaveProgress(); },
    };
})();

const Processing = (() => {
    const GetType = (id, progressObj = null) => {
        if (typeof (id) !== 'number') id = parseInt(id);
        if (!progressObj) progressObj = Data.ProgressGet()[id];
        if (!progressObj || progressObj.Unlocked == 0) return (Data.IgnoredGet().has(id)) ? 'Ignored' : 'Default';
        if (progressObj.Unlocked === progressObj.Total) return 'Mastered';
        return progressObj.Unlocked / progressObj.Total >= 0.5 ? 'Halfway' : 'Started';
    };

    const GroupByTypes = (rowObjs, progressById = null) => rowObjs.reduce((p, rowObj) => {
        const type = Processing.GetType(rowObj.Id, progressById?.[rowObj.Id]);
        if (type === 'Started' || type === 'Halfway') p.Played.push(rowObj);
        return { ...p, [type]: (p[type] || []).concat(rowObj) };
    }, { Played: [] });

    return { GetType, GroupByTypes };
})();

const Pages = (() => {
    const SetColoreByType = (p, type) => (
        color => {if (color) p.style.color = color})(Settings.TextColors[type]);

    const SetRowColor = (row, type) => {
        let a = row.getElementsByTagName('a')[0];
        let p = a.getElementsByTagName('p')[0];
        SetColoreByType(p, type);
    };
    const getProgressById = table => {
        return [...table.getElementsByTagName('tr')].filter(r => r.querySelector('a')).reduce((res, row) => {
            const Id = parseInt(row.getElementsByTagName('a')[0].href.split('/').at(-1));
            const progressTitle = row.querySelector('div[role="progressbar"]')?.ariaLabel;
            if (!progressTitle) return res;
            const hcProgressMatch = progressTitle.match(/(\d+)\/(\d+) \(hardcore\)/);
            const hcUnlocked = hcProgressMatch ? parseInt(hcProgressMatch[1]) : 0;
            const scProgressMatch = progressTitle.match(/(\d+)\/(\d+) \(softcore(?: only)?\)/);
            const scUnlocked = scProgressMatch ? parseInt(scProgressMatch[1]) : hcUnlocked;
            const Total = parseInt(hcProgressMatch ? hcProgressMatch[2] : scProgressMatch[2]);
            const Unlocked = Settings.UseHardcoreProgression ? hcUnlocked : scUnlocked;
            return Unlocked == 0 ? res : { ...res, [Id]: { Unlocked, Total } }
        }, {});
    };
    const GetRowsData = (table) => [...table.querySelectorAll('tr:not(.do-not-highlight)')].reduce((objs, Row) => {
        const cells = Row.getElementsByTagName('td');
        const a = Row.getElementsByTagName('a')[0];
        if (!a) return objs;
        const Id = parseInt(a.href.split('/').at(-1));
        const replaces = { "''": "'", '&amp;': '&', '  ': ' ' };
        const Name = Object.keys(replaces).reduce((p, c) => p.replaceAll(c, replaces[c]), a.textContent);
        return objs.concat({ Name, Id, Row });
    }, []);

    const SetNewOrder = (table, rowObjsByType, shouldColor, shouldSort) => {
        const tbody = table.getElementsByTagName('tbody')[0];
        const sorted = shouldSort && Settings.SortOrder.length > 0;
        const colorTypes = sorted ? Settings.SortOrder : DefaultSortOrder;
        colorTypes.forEach(type => {
            rowObjsByType[type]?.forEach(rowObj => {
                if (shouldColor) SetRowColor(rowObj.Row, type);
                if (sorted) tbody.append(rowObj.Row);
            });
        });
    };

    const isOwnUserPage = () => {
        const userName = document.querySelector('.dropdown-menu-right .dropdown-header')?.innerText;
        const urlName = window.location.pathname.split('/', 3)[2];
        return userName === urlName;
    };

    // user profile
    const User = (() => {
        const Do = () => {
            const urlName = window.location.pathname.split('/', 3)[2];
            if (!isOwnUserPage()) return;
            const progressMainBlock = document.getElementById('completedgames');
            if (!progressMainBlock) return;
            const progressBlock = document.getElementById('usercompletedgamescomponent');
            if (!progressBlock) return;
            const progressTable = progressBlock.getElementsByTagName('tbody')[0];
            // the rest of code is needed to recreate sorting
            const progress = getProgressById(progressTable);
            Data.ProgressSet(progress);
        };

        return { Do };
    })();

    // hub, system page, developer sets
    const Hub = (() => {
        const GetNewType = cell => {
            if (!cell) return 'Hub';
            const points = parseInt(cell.innerText.replace(/\d+ of /, '').replaceAll(',', ''));
            if (points > Settings.SmallSetThr) return null;
            return points > 0 ? 'SmallSet' : 'NoSet';
        };

        const SplitDefault = (rowsObjsByType) => rowsObjsByType.Default?.reduceRight((p, c, i) => {
            const newType = GetNewType(c.Row.getElementsByTagName('td')[2]);
            if (!newType) return p;
            p.Default.splice(i, 1);
            return { ...p, [newType]: [c, ...(p[newType] || [])] };
        }, rowsObjsByType) || rowsObjsByType;

        const Do = () => {
            if (!Settings.ColorHubLines && !Settings.SortHubLines) return;
            const tables = document.querySelectorAll('table.table-highlight');
            tables.forEach(table => {
                const rowsObjs = GetRowsData(table).sort((a, b) => a.Name.localeCompare(b.Name));
                const progress = getProgressById(table);
                const rowsObjsByType = SplitDefault(Processing.GroupByTypes(rowsObjs, progress));
                SetNewOrder(table, rowsObjsByType, Settings.ColorHubLines, Settings.SortHubLines);
            });
        };

        return { Do };
    })();

    // game page (and hub, redirected to Hub object)
    const Game = (() => {
        const Do = () => {
            if (!document.getElementsByClassName('commentscomponent')[0]) {
                Hub.Do();
                return;
            }
            const tables = [...document.getElementsByClassName('component gamealts')].map(c => {
                const name = c.firstChild.innerText;
                if (name === 'Hubs') return;
                return c.lastChild;
            }).filter(c => c);
            tables.forEach(table => {
                const rowsObjs = GetRowsData(table).sort((a, b) => a.Name.localeCompare(b.Name));
                const rowsObjsByType = Processing.GroupByTypes(rowsObjs);
                SetNewOrder(table, rowsObjsByType, true, true);
            });
        };

        return { Do };
    })();

    // All Games, Want to Play Games, Hardest Games, Hubs (ignored)
    const GameList = (() => {
        const YEAR = `${new Date().getFullYear()}`;

        // todo: refactor

        const nameMap = { Achievements: 'Achs', 'Last Updated': 'Updated', Leaderboards: 'LBs', 'Open Tickets': 'Tickets' };
        const GetHeaderPositions = header => [...header.getElementsByTagName('th')]
        .map(v => v?.innerText)
        .map((v, i) => v && { [nameMap[v] || v]: i })
        .filter(v => v)
        .reduce((p, c) => ({ ...p, ...c }), {});

        const AddProgress = (rowObj, i) => {
            const cells = rowObj.Row.getElementsByTagName('td');
            const progressObj = Data.ProgressGet()[rowObj.Id];
            const progressTextText = (progressObj && (Settings.ShowProgressFor100PercentUnlocks || progressObj.Unlocked !== progressObj.Total))
            ? `${progressObj.Unlocked} / ${progressObj.Total}` : null;
            if (progressTextText) cells[i].innerHTML = progressTextText;
            cells[i].style = 'text-align: right; padding-right: 2em;';
        };

        const FixDateText = text => {
            if (!text) return '';
            const textA = text.split(', ');
            if (textA.length < 2) return text;
            let retText = textA[0].replaceAll(' ', '&nbsp;');
            if (textA[1] !== YEAR) retText += ` ${textA[1]}`;
            return retText;
        };

        const FixCells = (cells, hPos, centerSet) => {
            // todo: refactor
            const styleRight = 'text-align: right; padding-right: 1em;';
            const styleCenter = 'text-align: center; white-space: nowrap';
            for (let i = cells.length - 1, e = hPos.Achs - (centerSet.size && 1); i >= e; i--) {
                const cell = cells[i];
                cell.style = centerSet.has(i) ? styleCenter : styleRight;
                //if (hPos.Updated && (i === hPos.Updated)) cell.innerHTML = FixDateText(cell.innerText);
            }

        };

        const FixHeader = (header, pageType, hPos) => {
            const CreateProgressForDevPage = () => {
                const thNew = document.createElement('th');
                thNew.innerHTML = 'Your&nbsp;Progress';
                thNew.style = 'text-align: center';
                return thNew;
            };

            const GetHeaderTextElement = base => base.getElementsByTagName('a')[0] || base;

            const ths = header.getElementsByTagName('th');

            if (hPos.Tickets) GetHeaderTextElement(ths[hPos.Tickets]).innerHTML = 'Tickets';
            if (hPos.Points) {
                GetHeaderTextElement(ths[hPos.Points]).innerHTML = 'Points&nbsp;(RetroP)';
                ths[hPos.Points].style = 'text-align: center;';
            }
            if (hPos.LBs) {
                GetHeaderTextElement(ths[hPos.LBs]).innerHTML = 'LBs';
                ths[hPos.LBs].style = 'text-align: "right"';
            }
            if (hPos.Updated) GetHeaderTextElement(ths[hPos.Updated]).innerHTML = 'Updated';
        };

        const FixFooter = (footer, pageType, hPos, centerSet, totalUnlocks) => {
            const cells = footer.getElementsByTagName('td');
            cells[hPos.Achs].innerHTML = cells[hPos.Achs].innerHTML.replace(/([\d,]+)/, totalUnlocks + ' / $1');
            FixCells(cells, hPos, centerSet);
            const lastCell = cells[cells.length - 1];
            if (!lastCell.innerHTML) footer.insertBefore(lastCell, cells.at(-3));
        };

        const ProcessRows = (rowObjs, pageType, hPos, centerSet) => {
            for (let i = 0; i < rowObjs.length; i++) {
                const rowObj = rowObjs[i];
                const type = Processing.GetType(rowObj.Id);
                SetRowColor(rowObj.Row, type);
                if (hPos.Achs) {
                    AddProgress(rowObj, hPos.Achs);
                    FixCells(rowObj.Row.getElementsByTagName('td'), hPos, centerSet);
                }
            }
        };

        const DoList = (table, pageType) => {
            const rowObjs = GetRowsData(table);
            const rows = table.getElementsByTagName('tr');
            if (rows.length < 2) return null;
            const hPos = GetHeaderPositions(rows[0]);

            // todo: refactor
            FixHeader(rows[0], pageType, hPos);
            const centerSet = new Set();
            const lastRow = rows[rows.length - 1];
            if (lastRow.classList.contains('do-not-highlight')) {
                const totalUnlocks = rowObjs.map(r => Data.ProgressGet()[r.Id]?.Unlocked ?? 0).reduce((v, s) => v + s, 0).toLocaleString('en-US');
                FixFooter(lastRow, pageType, hPos, centerSet, totalUnlocks);
            }
            ProcessRows(rowObjs, pageType, hPos, centerSet);
            return null;
        };

        const Hardest = () => DoList(document.querySelector('.detaillist table'), 'h');

        const GetPageType = () => {
            const cVal = GetUrlParam('c');
            if (cVal) return (cVal === '0') ? PageTypes.all : (cVal === '100') ? PageTypes.hubs : PageTypes.consoles;
            const tVal = GetUrlParam('t');
            if (tVal && tVal === 'play') return PageTypes.toplay;
            return PageTypes.all; // default
        };

        const Do = () => {
            const pageType = GetPageType();
            if (pageType === PageTypes.hubs) return;
            const tables = document.getElementsByTagName('table');
            for (let i = 0; i < tables.length; i++) {
                const error = DoList(tables[i], pageType);
                if (error) { alert(error); return; }
            }
        };

        return { Hardest, Do };
    })();

    // Most Requested
    const SetRequests = (() => {

        const splitDefault = (rowsObjsByType) => rowsObjsByType.Default?.reduceRight((p, c, i) => {
            const text = c.Row.getElementsByTagName('td')[1].innerText;
            if (c.Row.getElementsByTagName('td')[1].innerText.trim() === 'Set Exists') return p;
            p.Default.splice(i, 1);
            return { ...p, NoSet: [c, ...(p.NoSet || [])] };
        }, rowsObjsByType) || rowsObjsByType;

        const Do = () => {
            if (new URLSearchParams(window.location.search).get('f') !== '1') return;
            const table = document.querySelector('article table.table-highlight');
            const rowsObjs = GetRowsData(table).sort((a, b) => a.Name.localeCompare(b.Name));
            const rowsObjsByType = splitDefault(Processing.GroupByTypes(rowsObjs));
            SetNewOrder(table, rowsObjsByType, Settings.ColorSetRequestLines, Settings.SortSetRequestLines);
            if (rowsObjsByType.NoSet) {
                const titleCell = document.createElement('th');
                titleCell.innerHTML = 'Progress';
                table.querySelector('tr.do-not-highlight')?.append(titleCell);
                rowsObjs.forEach(rowObj => {
                    const newCell = document.createElement('td');
                    rowObj.Row.append(newCell);
                    const progressObj = Data.ProgressGet()[rowObj.Id];
                    const progressTextText = (progressObj && (Settings.ShowProgressFor100PercentUnlocks || progressObj.Unlocked !== progressObj.Total))
                    ? `${progressObj.Unlocked} / ${progressObj.Total}` : null;
                    if (progressTextText) newCell.innerHTML = progressTextText;
                });
            }
        };

        return { Do };
    })();

    // links in Forum posts
    const Forum = (() => {
        const GetLinks = () => [...document
                                .getElementsByTagName("article")[0]
                                .getElementsByClassName('comment')]
        .flatMap(v => [...v.getElementsByClassName('inline-block')])
        .filter(v => v.href);

        const Do = () => {
            const links = GetLinks();
            links.forEach(v => {
                const link = v;
                const hrefA = link.href.split('/');
                if (hrefA.at(-2) !== 'game') return;
                const id = parseInt(hrefA.at(-1));
                if (Number.isNaN(id)) return;
                SetColoreByType(link, Processing.GetType(id));
            });
        };

        return { Do };
    })();

    // Completion Progress page
    const Progress = (() => {
        const Do = () => {
            if (!Settings.ColorProgressLines || !document.querySelector('nav .dropdown-menu-right')) return; // not authenticated
            if (isOwnUserPage()) return;
            // for each game, first link is the image, second is the game name
            const gameLinks = [...document.querySelectorAll('article ol li')].map(li => li.getElementsByTagName('a')[1]);
            gameLinks.forEach(link => {
                const id = parseInt(link.href.split('/').at(-1));
                if (!Number.isNaN(id)) SetColoreByType(link, Processing.GetType(id));
            });
        };
        return { Do };
    })();

    const SettingsPage = (() => {
        const settingsDivHtml = `<div class="component">
	<h4>Color Mark Games</h4>
	<table class="table-highlight">
		<tbody>
			<tr>
				<td>Text colors</td>
				<td style="text-align: right;">
					<select id="colorSelect"></select>
					<input id="colorPicker" type="color" style="vertical-align: middle;">
					<label><input id="defaultColorCheckbox" type="checkbox"> site default</label>
					<div id="resetColorIcon" class="icon" title="reset element to script default" style="cursor: pointer; font-size: 1.5em; vertical-align: sub;">↩️</div>
				</td>
			</tr>
			<tr>
				<td>Sort order</td>
				<td style="text-align: right;">
					<div class="icon" title="Set to empty value to ignore sorting" style="cursor: help;">💡</div>
					<input id="sortOrderInput" type="text" size="55">
					<div id="resetOrderIcon" class="icon" title="reset to default" style="cursor: pointer; font-size: 1.5em; vertical-align: sub;">↩️</div>
				</td>
			</tr>
			<tr>
				<td>Small set threshold</td>
				<td style="text-align: right;">
					<div class="icon" title="Set to 0 to keep with Default group" style="cursor: help;">💡</div>
					<input id="smallSetThrInput" type="number" min="0" style="width: 7em;"/>
				</td>
			</tr>
			<tr>
				<td>Show progress for 100% unlocks</td>
				<td style="text-align: right;">
					<input id="show100ProgressCheckbox" type="checkbox"/>
				</td>
			</tr>
			<tr>
				<td>Use hardcore progression</td>
				<td style="text-align: right;">
					<div class="icon" title="Reload Profile page for the change to take effect" style="cursor: help;">💡</div>
					<input id="useHardcoreCheckbox" type="checkbox"/>
				</td>
			</tr>
			<tr>
				<td>Game lists with progress bars <div class="icon" title="Hubs, console game lists and dev sets lists" style="cursor: help;">💡</div></td>
				<td style="text-align: right;">
					<label><input id="colorHubsCheckbox" type="checkbox"/> color</label>
                    <label><input id="sortHubsCheckbox" type="checkbox"/> sort</label>
				</td>
			</tr>
			<tr>
				<td>Completion progress <div class="icon" title="Other users completion progress pages" style="cursor: help;">💡</div></td>
				<td style="text-align: right;">
					<label><input id="colorProgressCheckbox" type="checkbox"/> color</label>
				</td>
			</tr>
			<tr>
				<td>User set requests</td>
				<td style="text-align: right;">
					<label><input id="colorSetRequestsCheckbox" type="checkbox"/> color</label>
                    <label><input id="sortSetRequestsCheckbox" type="checkbox"/> sort</label>
				</td>
			</tr>
		</tbody>
	</table>
</div>`
        // default color for links
        const defaultColor = 'var(--link-color)';

        const Do = () => {
            const xpathRes = document.evaluate("//div[h3[text()='Settings']]", document, null, XPathResult.ORDERED_NODE_ITERATOR_TYPE, null);
            const settingsDiv = xpathRes.iterateNext();
            if (settingsDiv == null) return;

            const newDiv = document.createElement('div');
            settingsDiv.insertAdjacentElement('afterend', newDiv);
            newDiv.outerHTML = settingsDivHtml;

            // color selection
            const colorsInput = document.getElementById('colorPicker');
            // list to select the type for which the color is chosen
            const colorSelect = document.getElementById('colorSelect');
            // items are sorted according to the order settings, with additional entries at the end
            Object.keys(Settings.TextColors).forEach(type => {
                colorSelect.innerHTML += `<option name="${type}" value="${type}" style="color: ${Settings.TextColors[type] || defaultColor}">${type}</option>`;
            });
            colorSelect.innerHTML += `<option name="separator" disabled>--</option>`;
            const updateColorSelectOrder = sortOrder => {
                const otherTypes = Object.keys(Settings.TextColors).filter(t => !sortOrder.includes(t));
                [...sortOrder, 'separator', ...otherTypes].forEach(type => {colorSelect.append(colorSelect.namedItem(type))});
                colorSelect.namedItem('separator').classList[sortOrder.length == 0 ? 'add' : 'remove']('hidden');
            };
            updateColorSelectOrder(Settings.SortOrder);

            const defaultColorCheckbox = document.getElementById('defaultColorCheckbox');
            colorSelect.selectedIndex = (Settings.SortOrder.length > 0) ? 0 : 1;
            // updates the UI elements from this raw when the color or selected item change
            const updateUIColor = () => {
                const color = Settings.TextColors[colorSelect.selectedOptions[0].value];
                if (color !== '') colorsInput.value = color;
                defaultColorCheckbox.checked = color === '';
                colorsInput.disabled = defaultColorCheckbox.checked;
                colorsInput.style.opacity = colorsInput.disabled ? '0.2' : '';
            }
            updateUIColor();
            colorSelect.addEventListener('change', updateUIColor);
            const changeColor = color => {
                Settings.TextColors[colorSelect.selectedOptions[0].value] = color;
                updateUIColor();
                colorSelect.selectedOptions[0].style.color = color || defaultColor;
                GM_setValue('textColors', Settings.TextColors);
            };
            defaultColorCheckbox.addEventListener('input', () => changeColor(defaultColorCheckbox.checked ? '' : colorsInput.value));
            colorsInput.addEventListener('input', () => changeColor(colorsInput.value));
            const resetColorIcon = document.getElementById('resetColorIcon');
            resetColorIcon.addEventListener('click', () => changeColor(DefaultTextColors[colorSelect.selectedOptions[0].value]));

            // textbox with the order (and reset button)
            const sortOrderInput = document.getElementById('sortOrderInput');
            sortOrderInput.value = Settings.SortOrder.join(', ');
            // checks that everything is OK before changing the setting
            const checkOrderList = order => {
                if (order.length == 0) return '';
                if (order.includes('')) return 'Empty value not allowed';
                const excess = order.find(t => !DefaultSortOrder.includes(t) && t !== 'Played');
                if (excess) return `Unkown value: ${excess}`;
                if (order.length != new Set(order).size) return 'Duplicate values';
                const missing = new Set(DefaultSortOrder.filter(t => !order.includes(t)));
                if (order.includes('Played')) {
                    if (!missing.delete('Started') || !missing.delete('Halfway')) return 'Played is redundant with Started and Halfway';
                } else {
                    if (missing.has('Halfway') || missing.has('Started')) return 'Must contain either Played or both Started and Halfway';
                }
                if (missing.size > 0) return `Missing value${missing.size > 1 ? 's':''}: ${[...missing].join(', ')}`;
                return '';
            };
            sortOrderInput.addEventListener('change', () => {
                const newOrder = sortOrderInput.value.split(',').map(s => s.trim());
                if (newOrder.length == 1 && newOrder[0] === '') newOrder.pop();
                const errorMsg = checkOrderList(newOrder);
                sortOrderInput.title = errorMsg;
                sortOrderInput.style['border-color'] = errorMsg ? 'red' : null;
                if (!errorMsg) {
                    updateColorSelectOrder(newOrder);
                    GM_setValue('sortOrder', newOrder);
                }
            });
            const resetOrderIcon = document.getElementById('resetOrderIcon')
            resetOrderIcon.addEventListener('click', () => {
                sortOrderInput.value = DefaultSortOrder.join(', '); DefaultSortOrder;
                updateColorSelectOrder(DefaultSortOrder);
                GM_deleteValue('sortOrder');
            });

            // other, simpler settings

            const smallSetThrInput = document.getElementById('smallSetThrInput');
            smallSetThrInput.value = Settings.SmallSetThr;
            smallSetThrInput.addEventListener('input', () => {
                GM_setValue('smallSetThr', smallSetThrInput.value);
            });

            const bindCheckbox = (checkboxId, settingKey, storageKey) => {
                const checkbox = document.getElementById(checkboxId);
                checkbox.checked = Settings[settingKey];
                checkbox.addEventListener('input', () => {
                    GM_setValue(storageKey, checkbox.checked);
                });
            };

            bindCheckbox('show100ProgressCheckbox', 'ShowProgressFor100PercentUnlocks', 'showProgressFor100PercentUnlocks');
            bindCheckbox('useHardcoreCheckbox', 'UseHardcoreProgression', 'useHardcoreProgression');
            bindCheckbox('colorHubsCheckbox', 'ColorHubLines', 'colorHubLines');
            bindCheckbox('sortHubsCheckbox', 'SortHubLines', 'sortHubLines');
            bindCheckbox('colorProgressCheckbox', 'ColorProgressLines', 'colorProgressLines');
            bindCheckbox('colorSetRequestsCheckbox', 'ColorSetRequestLines', 'colorSetRequestLines');
            bindCheckbox('sortSetRequestsCheckbox', 'SortSetRequestLines', 'sortSetRequestLines');
        };

        return { Do };
    })();

    return {
        user: User.Do,
        game: Game.Do,
        system: Hub.Do,
        developer: Hub.Do,
        gameList: GameList.Do,
        setRequestList: SetRequests.Do,
        progress: Progress.Do,
        viewtopic: Forum.Do,
        controlpanel: SettingsPage.Do,
        gameSearch: GameList.Hardest
    };
})();

if (window.top === window.self) {
    const action = (() => {
        const pathname = window.location.pathname;
        if (pathname.match(/^\/user\/.*\/developer\/sets/)) return Pages.developer;
        if (pathname.match(/^\/user\/.*\/progress/)) return Pages.progress;
        return Pages[pathname.split('/', 2)[1].split('.php', 1)[0]];
    })();
    if (action) document.addEventListener("DOMContentLoaded", action);
}
