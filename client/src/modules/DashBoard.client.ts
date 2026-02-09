/* eslint-disable max-lines */

import ApexCharts from 'apexcharts';
import { animate } from 'motion';

const API_BASE = 'https://api.epmarketingandresearch.com';

// ─── Skeleton loader utilities ───────────────────────────────────────────────
const skeletonsByList = new Map<HTMLElement, HTMLElement[]>();

function showSkeletons(listEl: HTMLElement, count: number) {
	clearSkeletons(listEl);
	const batch: HTMLElement[] = [];
	for (let i = 0; i < count; i++) {
		const sk = document.createElement('li');
		sk.className = 'py-2 sm:py-2';
		sk.innerHTML = `
			<div class="flex items-center justify-between">
				<div class="h-4 bg-gray-200 dark:bg-gray-700 rounded w-32"></div>
				<div class="h-4 bg-gray-200 dark:bg-gray-700 rounded w-48"></div>
			</div>`;
		listEl.appendChild(sk);
		batch.push(sk);
		animate(sk, { opacity: [0.4, 1] }, { duration: 1, direction: 'alternate', repeat: Infinity });
	}
	skeletonsByList.set(listEl, batch);
}

function clearSkeletons(listEl?: HTMLElement) {
	if (listEl) {
		const batch = skeletonsByList.get(listEl) || [];
		batch.forEach((el) => el.remove());
		skeletonsByList.delete(listEl);
		return;
	}
	skeletonsByList.forEach((batch) => {
		batch.forEach((el) => el.remove());
	});
	skeletonsByList.clear();
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function formatTime(timestamp: string) {
	const options = {
		year: 'numeric',
		month: 'short',
		day: 'numeric',
		hour: 'numeric',
		minute: 'numeric',
		timeZoneName: 'short',
	} as const;
	return new Date(timestamp).toLocaleString('en-US', options);
}

function formatNumber(n: number): string {
	return n.toLocaleString('en-US');
}

function timeAgo(isoString: string): string {
	const diff = Date.now() - new Date(isoString).getTime();
	const mins = Math.floor(diff / 60000);
	if (mins < 1) return 'just now';
	if (mins < 60) return `${mins}m ago`;
	const hrs = Math.floor(mins / 60);
	if (hrs < 24) return `${hrs}h ${mins % 60}m ago`;
	return `${Math.floor(hrs / 24)}d ago`;
}

function formatDuration(ms: number): string {
	const secs = Math.floor(ms / 1000);
	if (secs < 60) return `${secs}s`;
	const mins = Math.floor(secs / 60);
	const remSecs = secs % 60;
	return `${mins}m ${remSecs}s`;
}

// ─── Fetch channels list ─────────────────────────────────────────────────────
let responseData = await fetch(`${API_BASE}/api/getChannels`);
let channelObject = await responseData.json() as { channels: string[] };
let channels = channelObject.channels as string[];
channels.sort();

// ─── 1. Stats Overview Cards ─────────────────────────────────────────────────
async function loadStatsOverview() {
	try {
		const [overviewResp, weeklyResp, trendingResp] = await Promise.all([
			fetch(`${API_BASE}/api/stats/overview`),
			fetch(`${API_BASE}/api/visits/totalWeekly`),
			fetch(`${API_BASE}/api/visits/trendingChannel`),
		]);

		if (overviewResp.ok) {
			const stats = await overviewResp.json();
			const el = (id: string) => document.getElementById(id);
			if (el('stat-visits-today')) el('stat-visits-today')!.textContent = formatNumber(stats.visitsToday);
			if (el('stat-online')) el('stat-online')!.textContent = formatNumber(stats.onlineUsers);
			if (el('stat-total-users')) el('stat-total-users')!.textContent = formatNumber(stats.totalUsers);
			if (el('stat-channels')) el('stat-channels')!.textContent = formatNumber(stats.totalChannels);
		}

		if (weeklyResp.ok) {
			const weekly = await weeklyResp.json();
			const el = document.getElementById('stat-visits-week');
			if (el) el.textContent = formatNumber(weekly.count);
		}

		if (trendingResp.ok) {
			const t = await trendingResp.json();
			if (t && t.channel) {
				const trendEl = document.getElementById('stat-trending');
				const pctEl = document.getElementById('stat-trending-pct');
				if (trendEl) trendEl.textContent = t.channel.toUpperCase();
				if (pctEl) {
					const sign = t.delta >= 0 ? '+' : '';
					const pct = t.pct_change != null ? `${sign}${t.pct_change}%` : '';
					pctEl.textContent = pct ? `${sign}${t.delta} visits (${pct})` : `${sign}${t.delta} visits`;
				}
			}
		}
	} catch (e) {
		console.error('Failed to load stats overview:', e);
	}
}

loadStatsOverview();

// ─── 2. Scraper Status Panel ─────────────────────────────────────────────────
async function loadScrapeStatus() {
	try {
		const resp = await fetch(`${API_BASE}/api/scrapeStatus`);
		if (!resp.ok) return;
		const s = await resp.json();

		const el = (id: string) => document.getElementById(id);

		// Status badge
		const badge = el('scrape-status-badge');
		const dot = el('scrape-status-dot');
		const text = el('scrape-status-text');
		if (badge && dot && text) {
			if (s.isFetching) {
				badge.className = 'inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-0.5 rounded-full bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300';
				dot.className = 'w-2 h-2 rounded-full bg-blue-500 animate-pulse';
				text.textContent = 'Scraping...';
			} else {
				badge.className = 'inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-0.5 rounded-full bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300';
				dot.className = 'w-2 h-2 rounded-full bg-green-500';
				text.textContent = 'Idle';
			}
		}

		// Details
		if (el('scrape-last-completed')) el('scrape-last-completed')!.textContent = s.lastCycleCompleted ? timeAgo(s.lastCycleCompleted) : 'Never';
		if (el('scrape-duration')) el('scrape-duration')!.textContent = s.lastCycleDurationMs ? formatDuration(s.lastCycleDurationMs) : '—';
		if (el('scrape-channels')) el('scrape-channels')!.textContent = s.lastCycleChannelCount ? `${s.lastCycleChannelCount} / ${s.totalChannels}` : '—';
		if (el('scrape-cycles')) el('scrape-cycles')!.textContent = s.cycleCount > 0 ? String(s.cycleCount) : '—';
		if (el('scrape-rate-limits')) {
			el('scrape-rate-limits')!.textContent = String(s.rateLimitsHit);
			if (s.rateLimitsHit > 0) {
				el('scrape-rate-limits')!.classList.add('text-yellow-600', 'dark:text-yellow-400');
			} else {
				el('scrape-rate-limits')!.classList.remove('text-yellow-600', 'dark:text-yellow-400');
			}
		}
		if (el('scrape-interval')) el('scrape-interval')!.textContent = `${s.intervalMs / 1000 / 60} min`;

		// Progress bar
		const progressWrap = el('scrape-progress-wrap');
		if (progressWrap) {
			if (s.isFetching && s.lastCycleStarted) {
				progressWrap.classList.remove('hidden');
				const elapsed = Date.now() - new Date(s.lastCycleStarted).getTime();
				const estimatedTotal = s.lastCycleDurationMs || (s.totalChannels * 1200);
				const pct = Math.min(95, Math.round((elapsed / estimatedTotal) * 100));
				const bar = el('scrape-progress-bar');
				const pctText = el('scrape-progress-text');
				if (bar) bar.style.width = `${pct}%`;
				if (pctText) pctText.textContent = `~${pct}%`;
			} else {
				progressWrap.classList.add('hidden');
			}
		}
	} catch (e) {
		console.error('Failed to load scrape status:', e);
	}
}

loadScrapeStatus();
setInterval(loadScrapeStatus, 10000);

// ─── 3. Top Channels Bar Chart ───────────────────────────────────────────────
let topChannelsChart: ApexCharts | null = null;

async function loadTopChannelsChart(days: number = 7) {
	try {
		const resp = await fetch(`${API_BASE}/api/visits/topChannels?days=${days}&limit=15`);
		if (!resp.ok) return;
		const data = await resp.json() as { channel: string; visit_count: number }[];

		const isDark = document.documentElement.classList.contains('dark');

		const options = {
			series: [{
				name: 'Visits',
				data: data.map(d => d.visit_count),
			}],
			chart: {
				type: 'bar' as const,
				height: 280,
				fontFamily: 'Inter, sans-serif',
				foreColor: isDark ? '#9CA3AF' : '#6B7280',
				toolbar: { show: false },
			},
			plotOptions: {
				bar: {
					horizontal: true,
					borderRadius: 4,
					barHeight: '70%',
				},
			},
			colors: ['#3B82F6'],
			xaxis: {
				categories: data.map(d => d.channel.toUpperCase()),
				labels: {
					style: { fontSize: '12px' },
				},
			},
			yaxis: {
				labels: {
					style: { fontSize: '12px', fontWeight: 600 },
				},
			},
			grid: {
				borderColor: isDark ? '#374151' : '#F3F4F6',
				xaxis: { lines: { show: true } },
				yaxis: { lines: { show: false } },
			},
			dataLabels: {
				enabled: true,
				style: { fontSize: '11px', fontWeight: 600 },
				formatter: (val: number) => formatNumber(val),
			},
			tooltip: {
				style: { fontSize: '13px', fontFamily: 'Inter, sans-serif' },
				y: { formatter: (val: number) => `${formatNumber(val)} visits` },
			},
		};

		const chartEl = document.getElementById('top-channels-chart');
		if (!chartEl) return;

		if (topChannelsChart) {
			topChannelsChart.updateOptions(options);
		} else {
			topChannelsChart = new ApexCharts(chartEl, options);
			topChannelsChart.render();
		}
	} catch (e) {
		console.error('Failed to load top channels chart:', e);
	}
}

loadTopChannelsChart(7);

const daysSelect = document.getElementById('top-channels-days') as HTMLSelectElement;
if (daysSelect) {
	daysSelect.addEventListener('change', () => {
		const title = daysSelect.closest('.bg-white, .dark\\:bg-gray-800')?.querySelector('h3');
		if (title) title.textContent = `Top Channels (${daysSelect.value} days)`;
		loadTopChannelsChart(parseInt(daysSelect.value));
	});
}

document.addEventListener('dark-mode', () => {
	if (topChannelsChart) loadTopChannelsChart(parseInt(daysSelect?.value || '7'));
});

// ─── 4. Shared user visits renderer ──────────────────────────────────────────
async function renderUserVisitsByQuery(query: { public_id?: string; userId?: number; name?: string }) {
	const userList = document.getElementById('user-list');
	if (!userList) return;

	while (userList.firstChild) userList.removeChild(userList.firstChild);
	showSkeletons(userList, 5);

	let url = `${API_BASE}/api/visitsByUser`;
	if (query.public_id) {
		url += `?public_id=${encodeURIComponent(query.public_id)}`;
	} else if (typeof query.userId === 'number') {
		url += `?userId=${query.userId}`;
	} else if (query.name) {
		url += `?user=@${encodeURIComponent(query.name)}`;
	}

	try {
		const controller = new AbortController();
		const timeoutId = setTimeout(() => controller.abort(), 15000);
		const response = await fetch(url, { signal: controller.signal });
		clearTimeout(timeoutId);

		if (!response.ok) throw new Error(`Server returned ${response.status}`);
		const data = await response.json();
		clearSkeletons(userList);

		if (!data || data.length === 0) {
			const emptyLi = document.createElement('li');
			emptyLi.classList.add('py-6', 'text-center', 'text-gray-500', 'dark:text-gray-400');
			emptyLi.innerHTML = `
				<svg class="mx-auto h-8 w-8 text-gray-300 dark:text-gray-600 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
				</svg>
				<p class="text-sm">No visits found for this user</p>`;
			userList.appendChild(emptyLi);
			return;
		}

		data.forEach((visit: any) => {
			const li = document.createElement('li');
			li.classList.add('py-2.5');
			li.innerHTML = `
				<div class="flex items-center justify-between">
					<span class="text-sm text-gray-700 dark:text-gray-300">${formatTime(visit.timestamp)}</span>
					<span class="text-xs font-semibold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 px-2 py-0.5 rounded">${visit.channel_name?.toUpperCase() || ''}</span>
				</div>`;
			userList.appendChild(li);
		});
	} catch (error: any) {
		clearSkeletons(userList);
		const errorLi = document.createElement('li');
		errorLi.classList.add('py-6', 'text-center');
		if (error.name === 'AbortError') {
			errorLi.innerHTML = `<div class="text-yellow-500 dark:text-yellow-400"><p class="font-medium text-sm">Request timed out</p><p class="text-xs text-gray-500 mt-1">Please try again.</p></div>`;
		} else {
			errorLi.innerHTML = `<div class="text-red-500 dark:text-red-400"><p class="font-medium text-sm">Failed to load visits</p><p class="text-xs text-gray-500 mt-1">${error.message || 'Please try again.'}</p></div>`;
		}
		userList.appendChild(errorLi);
	}
}

// ─── 5. Channel Visits Panel ─────────────────────────────────────────────────
if (document.getElementById('channel-tabs1')) {
	let currentPage = 1;
	const limit = 100;
	let loading = false;

	const select = document.getElementById('channel-tabs1') as HTMLSelectElement;
	const channelList = document.getElementById('visits-list');
	const visitsContainer = document.getElementById('visits');

	channels.forEach((channel) => {
		const option = document.createElement('option');
		option.value = channel;
		option.text = channel.toUpperCase();
		select.appendChild(option);
	});

	async function fetchVisits(channel: string, page: number) {
		const response = await fetch(`${API_BASE}/api/visitsByChannel?channel=${channel}&limit=${limit}&page=${page}`);
		return await response.json();
	}

	async function loadVisits(channel: string, page: number) {
		loading = true;
		if (channelList) showSkeletons(channelList, 6);
		const data = await fetchVisits(channel, page);
		clearSkeletons(channelList as HTMLElement);

		data.forEach((visit: any) => {
			const li = document.createElement('li');
			li.classList.add('py-1.5');
			li.innerHTML = `
				<button class="toggle-about-btn w-full text-left group" data-user-id="${visit.user_id}" data-online="${visit.online ? 1 : 0}" data-name="${visit.name}">
					<div class="flex items-center justify-between px-2 py-1 rounded-md group-hover:bg-blue-50 dark:group-hover:bg-gray-700 transition-colors">
						<div class="flex items-center gap-2 min-w-0">
							<span class="w-2 h-2 rounded-full flex-shrink-0 ${visit.online ? 'bg-green-500' : 'bg-gray-300 dark:bg-gray-600'}"></span>
							<span class="text-sm font-medium text-gray-900 dark:text-white truncate">${visit.name}</span>
						</div>
						<span class="text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap ml-2">${formatTime(visit.timestamp)}</span>
					</div>
				</button>`;

			li.querySelector('.toggle-about-btn')?.addEventListener('click', async function () {
				const aboutDiv = document.getElementById('about-tab');
				if (aboutDiv) aboutDiv.click();
				const btn = this as HTMLElement;
				const userInput = document.getElementById('user-input') as HTMLInputElement;
				if (userInput) userInput.value = (btn.getAttribute('data-name') || '').replace(/\s/g, '').replace('@', '');
				const userInfo = document.getElementById('user-info') as HTMLElement;
				if (userInfo) {
					const isOnline = btn.getAttribute('data-online') === '1';
					userInfo.innerHTML = `<span class="inline-flex items-center gap-1.5"><span class="w-2 h-2 rounded-full ${isOnline ? 'bg-green-500' : 'bg-red-400'}"></span>${isOnline ? 'Online' : 'Offline'}</span>`;
					userInfo.className = `text-sm font-medium text-center mb-2 ${isOnline ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400'}`;
				}
				await renderUserVisitsByQuery({ userId: Number(btn.getAttribute('data-user-id')) });
			});

			channelList?.appendChild(li);
		});
		loading = false;
	}

	let selectedChannel = channels[0] as string;
	await loadVisits(selectedChannel, currentPage);

	visitsContainer?.addEventListener('scroll', async () => {
		if (visitsContainer.scrollTop + visitsContainer.clientHeight >= visitsContainer.scrollHeight - 100 && !loading) {
			currentPage++;
			await loadVisits(selectedChannel, currentPage);
		}
	});

	select.addEventListener('change', async (event) => {
		selectedChannel = (event.target as HTMLSelectElement).value;
		channelList!.innerHTML = '';
		currentPage = 1;
		await loadVisits(selectedChannel, currentPage);
	});
}

// ─── 6. Channel Users Panel ──────────────────────────────────────────────────
if (document.getElementById('channel-tabs2')) {
	const select = document.getElementById('channel-tabs2') as HTMLSelectElement;
	const channelList = document.getElementById('channel-list');
	const faqContainer = document.getElementById('faq');

	channels.forEach((channel) => {
		const option = document.createElement('option');
		option.value = channel;
		option.text = channel.toUpperCase();
		select.appendChild(option);
	});

	async function fetchVisits(channel: string) {
		const response = await fetch(`${API_BASE}/api/usersByChannel?channel=${channel}`);
		const data = await response.json();
		return data.slice(0, 500);
	}

	async function loadVisits(channel: string) {
		if (channelList) showSkeletons(channelList, 6);
		const data = await fetchVisits(channel);
		clearSkeletons(channelList as HTMLElement);

		data.forEach((visit: any) => {
			const li = document.createElement('li');
			li.classList.add('py-1.5');
			li.innerHTML = `
				<button class="toggle-about-btn w-full text-left group" data-public-id="${visit.public_id}" data-online="${visit.online ? 1 : 0}" data-name="${visit.name}">
					<div class="flex items-center justify-between px-2 py-1 rounded-md group-hover:bg-emerald-50 dark:group-hover:bg-gray-700 transition-colors">
						<div class="flex items-center gap-2 min-w-0">
							<span class="w-2 h-2 rounded-full flex-shrink-0 ${visit.online ? 'bg-green-500' : 'bg-gray-300 dark:bg-gray-600'}"></span>
							<span class="text-sm font-medium text-gray-900 dark:text-white truncate">${visit.name}</span>
						</div>
						<span class="text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap ml-2">${formatTime(visit.last_visit)}</span>
					</div>
				</button>`;

			li.querySelector('.toggle-about-btn')?.addEventListener('click', async function () {
				const aboutDiv = document.getElementById('about-tab');
				if (aboutDiv) aboutDiv.click();
				const btn = this as HTMLElement;
				const userInput = document.getElementById('user-input') as HTMLInputElement;
				if (userInput) userInput.value = (btn.getAttribute('data-name') || '').replace(/\s/g, '').replace('@', '');
				const userInfo = document.getElementById('user-info') as HTMLElement;
				if (userInfo) {
					const isOnline = btn.getAttribute('data-online') === '1';
					userInfo.innerHTML = `<span class="inline-flex items-center gap-1.5"><span class="w-2 h-2 rounded-full ${isOnline ? 'bg-green-500' : 'bg-red-400'}"></span>${isOnline ? 'Online' : 'Offline'}</span>`;
					userInfo.className = `text-sm font-medium text-center mb-2 ${isOnline ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400'}`;
				}
				await renderUserVisitsByQuery({ public_id: btn.getAttribute('data-public-id') || '' });
			});

			channelList?.appendChild(li);
		});
	}

	let selectedChannel = channels[0] as string;
	await loadVisits(selectedChannel);

	select.addEventListener('change', async (event) => {
		selectedChannel = (event.target as HTMLSelectElement).value;
		channelList!.innerHTML = '';
		await loadVisits(selectedChannel);
	});

	let loading = false;
	faqContainer?.addEventListener('scroll', async () => {
		if (faqContainer.scrollTop + faqContainer.clientHeight >= faqContainer.scrollHeight - 100 && !loading) {
			loading = true;
			await loadVisits(selectedChannel);
			loading = false;
		}
	});
}

// ─── 7. User Search Panel ────────────────────────────────────────────────────
if (document.getElementById('user-input')) {
	const userInput = document.getElementById('user-input') as HTMLInputElement;
	const userList = document.getElementById('user-list');

	userInput.addEventListener('keydown', async (event: any) => {
		if (event.key === 'Enter') {
			const user = (event.target as HTMLInputElement).value;
			const userInfo = document.getElementById('user-info') as HTMLElement;
			userInfo.innerHTML = '';
			if (userList) showSkeletons(userList, 4);

			const userData = await fetch(`${API_BASE}/api/user/getByName?name=@${user}`);
			const userDataJson = await userData.json();
			const isAnyUserOnline = userDataJson.some((u: any) => u.online);

			if (userInfo) {
				userInfo.innerHTML = `<span class="inline-flex items-center gap-1.5"><span class="w-2 h-2 rounded-full ${isAnyUserOnline ? 'bg-green-500' : 'bg-red-400'}"></span>${isAnyUserOnline ? 'Online' : 'Offline'}</span>`;
				userInfo.className = `text-sm font-medium text-center mb-2 ${isAnyUserOnline ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400'}`;
			}

			await renderUserVisitsByQuery({ name: user });
			clearSkeletons(userList as HTMLElement);
		}
	});
}
