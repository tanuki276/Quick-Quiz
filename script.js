// --- グローバル定数と変数の設定 ---
const container = document.getElementById('history-list-container');
const downloadContainer = document.getElementById('download-container');
const searchInput = document.getElementById('search-input');
const searchButton = document.getElementById('search-button');
const tagToggleSwitch = document.getElementById('tag-toggle-switch'); 
const searchModeRadios = document.querySelectorAll('input[name="search-mode"]');
// ★追加: データソース切り替えのためのUI要素
const switchDataBtn = document.getElementById('switch-data-btn'); 
const statusMessage = document.getElementById('status-message'); 

let integratedDataCache = null; // 統合された全データ（フィルター前）

// ★修正: const から let に変更し、no系をデフォルトに設定
let currentTotalFiles = 9; 
let currentFileBaseName = 'no'; 
const fileExtension = '.json';
const basePath = './'; 


// --- イベントリスナーの設定 ---

searchButton.addEventListener('click', function() {
    performLocalSearch();
});

searchInput.addEventListener('keypress', function(e) {
    if (e.key === 'Enter') {
        performLocalSearch();
    }
});

tagToggleSwitch.addEventListener('change', function() {
    refreshDisplayBasedOnCurrentState();
});

searchModeRadios.forEach(radio => {
    radio.addEventListener('change', function() {
        refreshDisplayBasedOnCurrentState();
    });
});

// ★追加: データソース切り替えイベントリスナー
if (switchDataBtn) {
    switchDataBtn.addEventListener('click', function() {
        if (currentFileBaseName === 'no') {
            // 'no' 系 -> 'mo' 系 (1ファイル) に切り替え
            setFileConfiguration('mo', 1);
        } else {
            // 'mo' 系 -> 'no' 系 (9ファイル) に切り替え
            setFileConfiguration('no', 9);
        }
    });
}


// --- ファイル設定とデータ読み込み関連関数 ---

/**
 * ファイル設定を更新し、JSONデータの再読み込みを開始する
 * @param {string} baseName - ファイル名のベース (mo or no)
 * @param {number} total - 読み込むファイルの総数
 */
function setFileConfiguration(baseName, total) {
    currentFileBaseName = baseName;
    currentTotalFiles = total;
    if (switchDataBtn) {
        switchDataBtn.textContent = `現在のデータ: ${baseName.toUpperCase()}系 (${total}ファイル)`;
    }
    if (statusMessage) {
        statusMessage.textContent = `データソースを ${baseName.toUpperCase()} 系に切り替え、再読み込みを開始します...`;
    }
    // データの再読み込み
    loadAndIntegrateJson();
}


/**
 * 指定されたファイル設定に基づいてJSONファイルを読み込み、データを統合する
 */
async function loadAndIntegrateJson() {
    let rawDataArray = [];
    
    const loadingMsg = `JSONファイル (${currentFileBaseName}1.json ~ ${currentFileBaseName}${currentTotalFiles}.json) をフェッチ中...`;
    container.innerHTML = `<div class="loading-message">${loadingMsg}</div>`;
    downloadContainer.innerHTML = ''; // ロード中はダウンロードボタンを消去

    try {
        for (let i = 1; i <= currentTotalFiles; i++) {
            const fileName = `${currentFileBaseName}${i}${fileExtension}`;
            const url = basePath + fileName; 

            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`🚨 ネットワーク/ファイル存在エラー: ${url}が見つからないか、読み込み失敗 (Status: ${response.status})。`);
            }

            const jsonContent = await response.json();

            // ★修正: JSONが {history_structured_list: {regions: [...]}} の形式を想定
            if (jsonContent && jsonContent.history_structured_list && Array.isArray(jsonContent.history_structured_list.regions)) {
                 rawDataArray.push(...jsonContent.history_structured_list.regions);
            } else if (Array.isArray(jsonContent)) {
                 // 以前の形式（カテゴリー形式）の配列データを暫定的に処理する場合はロジックが必要だが、
                 // 今回はご提供のデータ形式を優先し、エラーとして扱う。
                 throw new Error(`ファイル「${fileName}」のデータ構造が期待された形式ではありませんでした。`);
            } else {
                 throw new Error(`ファイル「${fileName}」のデータ構造が期待された形式ではありませんでした (history_structured_listキーが見つかりません)。`);
            }
        }

        // 複数のファイルから集めた regions の配列を統合
        const finalIntegratedData = { history_structured_list: { regions: rawDataArray } };
        integratedDataCache = finalIntegratedData;

        // 成功時の処理
        if (statusMessage) {
            statusMessage.textContent = `✅ データソース: ${currentFileBaseName.toUpperCase()}系 (${currentTotalFiles}ファイル) の統合に成功しました。`;
        }

        displayData(finalIntegratedData); 
        // 統合された全データをダウンロード可能にする
        createDownloadButton(finalIntegratedData, false); 

    } catch (error) {
        console.error("統合処理の致命的エラー:", error);
        container.innerHTML = `<div class="error-message">🚨 データの統合・読み込みに失敗しました 🚨<br><strong>データソース:</strong> ${currentFileBaseName.toUpperCase()}系<br><strong>エラー内容:</strong> ${error.message}<br>※ JSONファイルがサーバーに存在し、有効な形式であることを確認してください。</div>`;
        downloadContainer.innerHTML = ''; 
        if (statusMessage) statusMessage.textContent = `❌ データの読み込みに失敗しました。エラー発生。`;
    }
}


/**
 * ダウンロードボタンを作成/更新する（全体版とフィルタリング版に対応）
 * @param {object} dataToDownload - ダウンロード対象のデータ
 * @param {boolean} isFiltered - フィルタリングされた結果かどうか
 */
function createDownloadButton(dataToDownload, isFiltered) {
    downloadContainer.innerHTML = ''; 

    const button = document.createElement('button');
    button.id = 'download-button';
    
    // フィルタリング結果か、全統合データかでファイル名とラベルを分ける
    const baseFileName = `history_${currentFileBaseName}`;
    const fileSuffix = isFiltered ? '_filtered' : '_full';
    const fileName = `${baseFileName}${fileSuffix}.json`;
    
    const buttonLabel = isFiltered 
        ? '💾 検索結果をJSONでダウンロード' 
        : `💾 統合JSONデータ (${currentFileBaseName.toUpperCase()}系 全${currentTotalFiles}ファイル) をダウンロード`;
    
    button.textContent = buttonLabel;

    const jsonString = JSON.stringify(dataToDownload, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    button.onclick = () => {
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName; 
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url); 
    };

    downloadContainer.appendChild(button);
}


// --- 検索と表示関連関数 ---

/**
 * 現在の状態（検索クエリ、トグル、モード）に基づいて表示を更新する
 */
function refreshDisplayBasedOnCurrentState() {
    if (integratedDataCache) {
        const currentQuery = searchInput.value.trim();
        const filteredData = filterData(integratedDataCache, currentQuery); 
        displayData(filteredData);
        
        // ★修正: フィルタリング結果をダウンロード対象としてボタンを更新
        // (integratedDataCache !== filteredData) はオブジェクト参照が異なるため常に true になるので、
        // 検索クエリがあるかどうかで判断するのが安全
        const isFiltered = currentQuery.length > 0;
        createDownloadButton(filteredData, isFiltered); 
    }
}

function createWikipediaSearchUrl(query) {
    const encodedQuery = encodeURIComponent(query.trim());
    if (!encodedQuery) return '#'; 
    return `https://ja.wikipedia.org/w/index.php?search=${encodedQuery}&go=Go`;
}

function performLocalSearch() {
    const originalQuery = searchInput.value.trim(); 

    if (!originalQuery) {
        if (integratedDataCache) {
            displayData(integratedDataCache);
            createDownloadButton(integratedDataCache, false); // 全体ダウンロードに戻す
        }
        searchButton.textContent = '検索開始';
        searchButton.onclick = performLocalSearch;
        return;
    }

    // 括弧内の文字を抽出するロジック (Wikipedia検索用)
    const match = originalQuery.match(/[（\(](.+?)[）\)]/);
    const insideParentheses = match ? match[1].trim() : '';
    const outsideParentheses = originalQuery.replace(/[（\(].+?[）\)]/g, '').trim();

    let finalSearchQuery;
    if (outsideParentheses) {
        finalSearchQuery = outsideParentheses;
    } else if (insideParentheses) {
        finalSearchQuery = insideParentheses;
    } else {
        finalSearchQuery = originalQuery;
    }

    const wikipediaSearchUrl = createWikipediaSearchUrl(finalSearchQuery);

    if (integratedDataCache) {
        const filteredData = filterData(integratedDataCache, originalQuery); 
        displayData(filteredData);
        createDownloadButton(filteredData, true); // フィルタリング結果をダウンロード可能にする
    }

    searchButton.textContent = `📚 Wikipediaで "${finalSearchQuery}" を検索`; 
    searchButton.onclick = () => window.open(wikipediaSearchUrl, '_blank');
}

function filterData(data, query) {
    if (!query) return data;

    const currentSearchMode = document.querySelector('input[name="search-mode"]:checked').value;
    const keywords = query.toLowerCase().split(/\s+/).filter(k => k.length > 0); 

    if (keywords.length === 0) return data; 

    const filteredRegions = data.history_structured_list.regions.map(region => {
        const filteredPeriods = region.periods.map(period => {

            const filteredEntities = period.middle_level_entities.filter(entity => {
                const entityName = entity.name || '';
                const entityTags = entity.tags || [];
                const entityComposition = entity.composition || entity.capital || '';

                const searchTargetStrings = [
                    entityName.toLowerCase(), 
                    entityName.replace(/[（\(].+?[）\)]/g, '').trim().toLowerCase(), 
                    ...(entityName.match(/[（\(](.+?)[）\)]/) ? [entityName.match(/[（\(](.+?)[）\)]/)[1].toLowerCase()] : []), 
                    ...entityTags.map(tag => tag.toLowerCase()),
                    entityComposition.toLowerCase()
                ].filter(s => s.length > 0);

                if (currentSearchMode === 'AND') {
                    return keywords.every(keyword => {
                        return searchTargetStrings.some(target => target.includes(keyword));
                    });
                } else {
                    return keywords.some(keyword => {
                        return searchTargetStrings.some(target => target.includes(keyword));
                    });
                }
            });

            return filteredEntities.length > 0 ? { ...period, middle_level_entities: filteredEntities } : null;
        }).filter(p => p !== null);

        return filteredPeriods.length > 0 ? { ...region, periods: filteredPeriods } : null;
    }).filter(r => r !== null);

    // 新しいフィルタリングされたデータ構造を返す
    return { history_structured_list: { regions: filteredRegions } };
}


// adaptPrefectureData はデータ構造の不整合を避けるため削除済


/**
 * データをHTML上に表示する
 * @param {object} integratedData - 表示対象のデータ（フィルタリング後の可能性あり）
 */
function displayData(integratedData) {
    container.innerHTML = ''; 
    // データがない場合の安全策
    if (!integratedData || !integratedData.history_structured_list || !integratedData.history_structured_list.regions) {
        container.innerHTML = '<p class="error-message">🚨 データを読み込むか、有効なデータ構造が見つかりませんでした。</p>';
        return;
    }

    const regions = integratedData.history_structured_list.regions;
    const tagsVisible = tagToggleSwitch.checked;

    regions.forEach((region, regionIndex) => {
        const regionCard = document.createElement('div');
        regionCard.className = 'region-card';

        const regionHeader = document.createElement('div');
        regionHeader.className = 'region-header';
        regionHeader.textContent = `地域 ${region.region_id}: ${region.region_name}`;
        regionHeader.style.backgroundColor = '#6c757d'; 
        regionHeader.style.borderColor = '#495057';
        regionCard.appendChild(regionHeader);

        region.periods.forEach((period, periodIndex) => {
            const periodSection = document.createElement('div');
            periodSection.className = 'period-section';

            const upperLevel = document.createElement('div');
            upperLevel.className = 'period-upper';
            upperLevel.textContent = period.upper_level;

            let color;
            if (period.upper_level.includes('現在')) {
                 color = '#dc3545'; 
            } else if (period.upper_level.includes('構想中') || period.upper_level.includes('案')) {
                 color = '#ffc107'; 
            } else {
                 color = '#17a2b8'; 
            }
            upperLevel.style.color = color;
            upperLevel.style.borderColor = color;
            periodSection.appendChild(upperLevel);

            const entitiesList = document.createElement('ul');
            entitiesList.className = 'middle-entities-list';

            period.middle_level_entities.forEach(entity => {
                const listItem = document.createElement('li');

                const entityName = entity.name || '';
                const entityTags = entity.tags || [];

                let wikipediaQuery = entity.wiki_link_query || entityName.replace(/[\(（][^）\)]*[\)）]/g, '').trim();

                const wikipediaSearchUrl = createWikipediaSearchUrl(wikipediaQuery);

                const link = document.createElement('a');
                link.href = wikipediaSearchUrl;
                link.textContent = entityName; 
                link.target = '_blank'; 

                listItem.appendChild(link);

                if (tagsVisible) {
                    entityTags.forEach(tag => {
                        const tagSpan = document.createElement('span');
                        tagSpan.className = 'entity-tag';
                        tagSpan.textContent = tag;

                        if (period.upper_level.includes('現在')) {
                             tagSpan.style.backgroundColor = '#28a745'; 
                        } else {
                             tagSpan.style.backgroundColor = '#6c757d'; 
                        }

                        tagSpan.addEventListener('click', function(event) {
                            event.stopPropagation(); 
                            const tagSearchUrl = createWikipediaSearchUrl(tag);
                            window.open(tagSearchUrl, '_blank');
                        });

                        listItem.appendChild(tagSpan);
                    });
                }

                entitiesList.appendChild(listItem);
            });

            periodSection.appendChild(entitiesList);
            regionCard.appendChild(periodSection);
        });

        container.appendChild(regionCard);
    });

    if (regions.length === 0 || regions.every(r => r.periods.length === 0)) {
         container.innerHTML = '<p class="no-results-message">検索条件に一致するエンティティは見つかりませんでした。</p>';
    }
}

document.addEventListener('DOMContentLoaded', loadAndIntegrateJson);