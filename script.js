const container = document.getElementById('history-list-container');
const downloadContainer = document.getElementById('download-container');
const searchInput = document.getElementById('search-input');
const searchButton = document.getElementById('search-button');
const tagToggleSwitch = document.getElementById('tag-toggle-switch'); 
const searchModeRadios = document.querySelectorAll('input[name="search-mode"]');

let integratedDataCache = null;

const totalFiles = 1; 
const fileBaseName = 'mo'; 
const fileExtension = '.json';
const basePath = './'; 

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

function refreshDisplayBasedOnCurrentState() {
    if (integratedDataCache) {
        const currentQuery = searchInput.value.trim();
        const filteredData = filterData(integratedDataCache, currentQuery); 
        displayData(filteredData);
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
        }
        searchButton.textContent = '検索開始';
        searchButton.onclick = performLocalSearch;
        return;
    }

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

    return { history_structured_list: { regions: filteredRegions } };
}

function createDownloadButton(data) {
    downloadContainer.innerHTML = ''; 

    const button = document.createElement('button');
    button.id = 'download-button';
    button.textContent = '💾 統合JSONデータをダウンロード';

    const jsonString = JSON.stringify(data, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    button.onclick = () => {
        const a = document.createElement('a');
        a.href = url;
        a.download = 'integrated_history_data.json'; 
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url); 
    };

    downloadContainer.appendChild(button);
}

function adaptPrefectureData(rawData) {
    if (!Array.isArray(rawData)) {
        rawData = [rawData];
    }

    const adaptedRegions = [{
        region_id: 'JP_PREFECTURE_HISTORY',
        region_name: '日本の行政区画と歴史',
        periods: rawData.map((categoryBlock, index) => ({
            period_id: `PERIOD_${index}`,
            upper_level: categoryBlock.category_name, 
            middle_level_entities: categoryBlock.list.map(item => {
                const tags = [];
                const detail = item.composition || item.capital || '';
                if (detail) {
                    tags.push(detail.length > 20 ? detail.substring(0, 20) + '...' : detail);
                }
                
                return {
                    name: item.name,
                    tags: tags,
                    wiki_link_query: item.name,
                    composition: item.composition, 
                    capital: item.capital
                };
            })
        }))
    }];

    return { history_structured_list: { regions: adaptedRegions } };
}

async function loadAndIntegrateJson() {
    let rawData = [];
    container.innerHTML = `<div class="loading-message">JSONファイル (mo1.json) をフェッチ中...</div>`;

    try {
        for (let i = 1; i <= totalFiles; i++) {
            const fileName = `${fileBaseName}${i}${fileExtension}`;
            const url = basePath + fileName; 

            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`🚨 ネットワーク/ファイル存在エラー: ${url}が見つからないか、読み込み失敗 (Status: ${response.status})。`);
            }

            const jsonContent = await response.json();
            
            if (Array.isArray(jsonContent)) {
                rawData.push(...jsonContent);
            } else if (jsonContent && (jsonContent.category_name || jsonContent.list)) {
                 rawData.push(jsonContent);
            } else {
                 throw new Error(`ファイル「${fileName}」のデータ構造が期待された形式ではありませんでした。`);
            }
        }

        const finalIntegratedData = adaptPrefectureData(rawData);
        integratedDataCache = finalIntegratedData;

        displayData(finalIntegratedData); 

    } catch (error) {
        console.error("統合処理の致命的エラー:", error);
        container.innerHTML = `<div class="error-message">🚨 データの統合・読み込みに失敗しました 🚨<br><strong>エラー内容:</strong> ${error.message}<br>※ **mo1.json** がサーバーに存在し、有効なJSON形式であることを確認してください。</div>`;
        downloadContainer.innerHTML = ''; 
    }
}

function displayData(integratedData) {
    container.innerHTML = ''; 
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
