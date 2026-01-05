/* eslint-disable max-lines */

import ApexCharts from 'apexcharts';
import { animate } from 'motion';

// Skeleton loader utilities accessible across sections
const skeletonsByList = new Map<HTMLElement, HTMLElement[]>();

function showSkeletons(listEl: HTMLElement, count: number) {
	// Clear any existing skeletons for this list
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
	// Fallback: clear all
	skeletonsByList.forEach((batch, key) => {
		batch.forEach((el) => el.remove());
	});
	skeletonsByList.clear();
}

let responseData = await fetch('https://api.epmarketingandresearch.com/api/getChannels');
let channelObject = await responseData.json() as { channels: string[] };
let channels = channelObject.channels as string[];

// sort channels alphabetically
channels.sort();
console.log(channels)

const getColorForChannel = (channel: string) => {
	const colors = {
		bbb: '#E2E8F0',
		bg: '#1A56DB',
		gr: '#2A9D8F',
		gug: '#E76F51',
		hmr: '#F4A261',
		gldr: '#264653',
		sbmi: '#2B6CB0',
		abi: '#1A56DB',
		auu: '#D4A5A5',
		fkm: '#4A5568',
		gshr: '#38B2AC',
		ipt: '#ED8936',
		pega: '#9F7AEA',
		sdcu: '#F56565',
		sgz: '#48BB78',
	} as any;
	return colors[channel] || '#000000'; // Default to black if channel not found
};
let xAxisDates = [] as string[];
const monthNames = [
	'Jan',
	'Feb',
	'Mar',
	'Apr',
	'May',
	'Jun',
	'Jul',
	'Aug',
	'Sept',
	'Oct',
	'Nov',
	'Dec',
];

function formatToLocalMonthDay(timestamp: string) {
	let fullTimeStamp = timestamp + 'T00:00:00';
	const date = new Date(fullTimeStamp);

	return `${monthNames[date.getMonth()]} - ${date.getDate()}`;
}
//

// const chartData = await Promise.all(
// 	channels.map(async (channel) => {
// 		const response = await fetch(
// 			`https://api.epmarketingandresearch.com/api/visits/daily/lastSevenDays?channel=${channel}`,
// 		);
// 		// Adjust the date range
// 		const data = await response.json();
// 		data.forEach((visit: any) => {
// 			// date as Month - Day
// 			let dateFormat = `${formatToLocalMonthDay(visit.visit_date)}`;
// 			if (!xAxisDates.includes(dateFormat)) {
// 				xAxisDates.push(dateFormat);
// 			}
// 		});
// 		// Format the data for ApexCharts
// 		// it is possible that the data returned might be missing a date if no visits have been made on that day

// 		let dataArray = [] as number[];
// 		// Check to see if there is a missing date, and then add 0 to an array

// 		// first we want to take the data and convert it to local time, and add count to for each day.

// 		let earliestDate = Infinity;
// 		let date7DaysAgo = new Date();
// 		date7DaysAgo.setDate(date7DaysAgo.getDate() - 8);
// 		for (let i = 0; i < data.length; i++) {
// 			let visit = data[i];

// 			let visitDate = new Date(visit.visit_date);

// 			if (visitDate.getTime() < earliestDate) {
// 				earliestDate = visitDate.getTime();
// 			}
// 			let nextVisitDate = new Date();
// 			if (i < data.length - 1) {
// 				nextVisitDate = new Date(data[i + 1]?.visit_date);
// 			}

// 			// check to see if there is more then 24 hours between visits

// 			if (nextVisitDate.getTime() - visitDate.getTime() > 24 * 60 * 60 * 1000) {
// 				// the count and then another count of zero for the next day
// 				dataArray.push(visit.visit_count);

// 				// get how many days between
// 				let gap =
// 					(nextVisitDate.getTime() - visitDate.getTime()) /
// 					(24 * 60 * 60 * 1000);

// 				for (let j = 1; j < gap; j++) {
// 					dataArray.push(0);
// 				}
// 			} else {
// 				// there's no gap we can just add the count and proceed to next day
// 				dataArray.push(visit.visit_count);
// 			}
// 		}

// 		while (earliestDate > date7DaysAgo.getTime()) {
// 			earliestDate -= 24 * 60 * 60 * 1000;
// 			dataArray.unshift(0);
// 		}

// 		return {
// 			name: channel,
// 			data: dataArray, // Extract visit count for each day
// 			color: getColorForChannel(channel), // Helper function to get the color for each channel
// 		};
// 	}),
// );
//sort axis dates chronological
xAxisDates.sort((a, b) => {
	const dateA = new Date(a);
	const dateB = new Date(b);
	return dateA.getTime() - dateB.getTime();
});
// const getMainChartOptions = () => {
// 	let mainChartColors = {} as any;

// 	if (document.documentElement.classList.contains('dark')) {
// 		mainChartColors = {
// 			borderColor: '#374151',
// 			labelColor: '#9CA3AF',
// 			opacityFrom: 0,
// 			opacityTo: 0.15,
// 		};
// 	} else {
// 		mainChartColors = {
// 			borderColor: '#F3F4F6',
// 			labelColor: '#6B7280',
// 			opacityFrom: 0.45,
// 			opacityTo: 0,
// 		};
// 	}

// 	return {
// 		chart: {
// 			height: 420,
// 			type: 'area',
// 			fontFamily: 'Inter, sans-serif',
// 			foreColor: mainChartColors.labelColor,
// 			toolbar: {
// 				show: false,
// 			},
// 		},
// 		fill: {
// 			type: 'gradient',
// 			gradient: {
// 				enabled: true,
// 				opacityFrom: mainChartColors.opacityFrom,
// 				opacityTo: mainChartColors.opacityTo,
// 			},
// 		},
// 		dataLabels: {
// 			enabled: false,
// 		},
// 		tooltip: {
// 			style: {
// 				fontSize: '14px',
// 				fontFamily: 'Inter, sans-serif',
// 			},
// 		},
// 		grid: {
// 			show: true,
// 			borderColor: mainChartColors.borderColor,
// 			strokeDashArray: 1,
// 			padding: {
// 				left: 35,
// 				bottom: 15,
// 			},
// 		},
// 		series: chartData,
// 		markers: {
// 			size: 5,
// 			strokeColors: '#ffffff',
// 			hover: {
// 				size: undefined,
// 				sizeOffset: 3,
// 			},
// 		},
// 		xaxis: {
// 			categories: xAxisDates,
// 			labels: {
// 				style: {
// 					colors: [mainChartColors.labelColor],
// 					fontSize: '14px',
// 					fontWeight: 500,
// 				},
// 			},
// 			axisBorder: {
// 				color: mainChartColors.borderColor,
// 			},
// 			axisTicks: {
// 				color: mainChartColors.borderColor,
// 			},
// 			crosshairs: {
// 				show: true,
// 				position: 'back',
// 				stroke: {
// 					color: mainChartColors.borderColor,
// 					width: 1,
// 					dashArray: 10,
// 				},
// 			},
// 		},
// 		yaxis: {
// 			labels: {
// 				style: {
// 					colors: [mainChartColors.labelColor],
// 					fontSize: '14px',
// 					fontWeight: 500,
// 				},
// 				formatter(value: any) {
// 					return `${value}`;
// 				},
// 			},
// 		},
// 		legend: {
// 			fontSize: '14px',
// 			fontWeight: 500,
// 			fontFamily: 'Inter, sans-serif',
// 			labels: {
// 				colors: [mainChartColors.labelColor],
// 			},
// 			itemMargin: {
// 				horizontal: 10,
// 			},
// 		},
// 		responsive: [
// 			{
// 				breakpoint: 1024,
// 				options: {
// 					xaxis: {
// 						labels: {
// 							show: false,
// 						},
// 					},
// 				},
// 			},
// 		],
// 	};
// };

if (document.getElementById('main-chart')) {
	// const chart = new ApexCharts(
	// 	document.getElementById('main-chart'),
	// 	getMainChartOptions(),
	// );
	// chart.render();

	// // init again when toggling dark mode
	// document.addEventListener('dark-mode', () => {
	// 	chart.updateOptions(getMainChartOptions());
	// });
}
function formatTime(timestamp: string) {
	let options = {
		year: 'numeric',
		month: 'short',
		day: 'numeric',
		hour: 'numeric',
		minute: 'numeric',
		timeZoneName: 'short',
	} as const;
	let time = new Date(timestamp);
	return time.toLocaleString('en-US', options);
}

// Shared renderer to load and display a user's visits by precise identifier
async function renderUserVisitsByQuery(query: { public_id?: string; userId?: number; name?: string }) {
	const userList = document.getElementById('user-list');
	if (!userList) return;

	// Clear existing content
	while (userList.firstChild) {
		userList.removeChild(userList.firstChild);
	}

	// Show loading skeletons
	showSkeletons(userList as HTMLElement, 5);

	let url = 'https://api.epmarketingandresearch.com/api/visitsByUser';
	if (query.public_id) {
		url += `?public_id=${encodeURIComponent(query.public_id)}`;
	} else if (typeof query.userId === 'number') {
		url += `?userId=${query.userId}`;
	} else if (query.name) {
		url += `?user=@${encodeURIComponent(query.name)}`;
	}

	try {
		// Add timeout to detect hung requests
		const controller = new AbortController();
		const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 second timeout

		const response = await fetch(url, { signal: controller.signal });
		clearTimeout(timeoutId);

		if (!response.ok) {
			throw new Error(`Server returned ${response.status}`);
		}

		const data = await response.json();

		// Clear skeletons
		clearSkeletons(userList as HTMLElement);

		// Handle empty results
		if (!data || data.length === 0) {
			const emptyLi = document.createElement('li');
			emptyLi.classList.add('py-4', 'text-center', 'text-gray-500', 'dark:text-gray-400');
			emptyLi.innerHTML = `
					<svg class="mx-auto h-8 w-8 text-gray-400 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
					</svg>
					<p>No visits found for this user</p>
				`;
			userList.appendChild(emptyLi);
			return;
		}

		data.forEach((visit: any) => {
			let li = document.createElement('li');
			li.classList.add('py-3', 'sm:py-4');
			li.innerHTML = `
								<div class="flex items-center space-x-4">
									<div class="flex-1 min-w-0">
										<p class="font-medium text-gray-900 truncate dark:text-white">
											${formatTime(visit.timestamp)}
										</p>
									</div>
									<div class="inline-flex items-center text-base font-semibold text-gray-900 dark:text-white">
										${visit.channel_name}
									</div>
								</div>
				`;
			userList.appendChild(li);
		});
	} catch (error: any) {
		// Clear skeletons on error
		clearSkeletons(userList as HTMLElement);

		const errorLi = document.createElement('li');
		errorLi.classList.add('py-4', 'text-center');

		if (error.name === 'AbortError') {
			// Timeout error
			errorLi.innerHTML = `
					<div class="text-yellow-500 dark:text-yellow-400">
						<svg class="mx-auto h-8 w-8 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
						</svg>
						<p class="font-medium">Request timed out</p>
						<p class="text-sm text-gray-500 dark:text-gray-400 mt-1">The server is taking too long to respond. Please try again.</p>
					</div>
				`;
		} else {
			// General error
			errorLi.innerHTML = `
					<div class="text-red-500 dark:text-red-400">
						<svg class="mx-auto h-8 w-8 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
						</svg>
						<p class="font-medium">Failed to load visits</p>
						<p class="text-sm text-gray-500 dark:text-gray-400 mt-1">${error.message || 'Please try again later.'}</p>
					</div>
				`;
		}

		userList.appendChild(errorLi);
	}
}
if (document.getElementById('channel-tabs1')) {
	// Track current page and limit
	let currentPage = 1;
	const limit = 100;
	let loading = false;

	// Add options for each channel
	const select = document.getElementById('channel-tabs1') as HTMLSelectElement;
	const channelList = document.getElementById('visits-list');
	const visitsContainer = document.getElementById('visits'); // container with scroll

	channels.forEach((channel) => {
		const option = document.createElement('option');
		option.value = channel;
		option.text = channel;
		select.appendChild(option);
	});

	async function fetchVisits(channel: string, page: number) {
		const response = await fetch(
			`https://api.epmarketingandresearch.com/api/visitsByChannel?channel=${channel}&limit=${limit}&page=${page}`
		);
		return await response.json();
	}

	async function loadVisits(channel: string, page: number) {
		loading = true;
		if (channelList) showSkeletons(channelList as HTMLElement, 6);
		const data = await fetchVisits(channel, page);
		clearSkeletons(channelList as HTMLElement);

		// Append the data to the list
		data.forEach((visit: any) => {
			const li = document.createElement('li');
			li.classList.add('py-1', 'sm:py-1');

			li.innerHTML = `
				<button class="toggle-about-btn" data-user-id="${visit.user_id}" data-online="${visit.online ? 1 : 0}" data-name="${visit.name}">
					<div class="flex items-center justify-between cursor-pointer hover:bg-blue-200">
						<div class="flex items-center min-w-0">
							<div class="ml-3 flex">
								<p class="mr-4 font-small text-gray-900 truncate dark:text-white" id="name">
									${visit.name}
								</p>
								<div class="flex items-center justify-end flex-1 text-sm ${visit.online ? 'text-green-500' : 'text-red-500'
				}">
									<span>${formatTime(visit.timestamp)}</span>
									<span class="mx-1">|</span>
									<span>${visit.online ? 'Online' : 'Offline'}</span>
								</div>
							</div>
						</div>
					</div>
				</button>
			`;

			li.querySelector('.toggle-about-btn')?.addEventListener('click', async function () {
				const aboutDiv = document.getElementById('about-tab');
				if (aboutDiv) aboutDiv.click();

				const btn = li.querySelector('.toggle-about-btn') as HTMLElement;
				const userIdAttr = btn.getAttribute('data-user-id') || '';
				const onlineAttr = btn.getAttribute('data-online') || '0';
				const nameAttr = btn.getAttribute('data-name') || '';

				const userInput = document.getElementById('user-input') as HTMLInputElement;
				if (userInput) {
					userInput.value = (nameAttr || '').replace(/\s/g, '').replace('@', '');
				}

				const userInfo = document.getElementById('user-info') as HTMLElement;
				if (userInfo) {
					const isOnline = onlineAttr === '1';
					userInfo.innerHTML = isOnline ? 'Online' : 'Offline';
					userInfo.classList.toggle('text-green-500', isOnline);
					userInfo.classList.toggle('text-red-500', !isOnline);
				}

				await renderUserVisitsByQuery({ userId: Number(userIdAttr) });
			});

			channelList?.appendChild(li);
		});

		loading = false;
	}

	// Initial load
	let selectedChannel = channels[0] as string;
	await loadVisits(selectedChannel, currentPage);

	// Listen for scroll event to load more data when near the bottom
	visitsContainer?.addEventListener('scroll', async () => {
		if (
			visitsContainer.scrollTop + visitsContainer.clientHeight >= visitsContainer.scrollHeight - 100 &&
			!loading
		) {
			currentPage++;
			await loadVisits(selectedChannel, currentPage);
		}
	});

	// Reload data when a new channel is selected
	select.addEventListener('change', async (event) => {
		selectedChannel = (event.target as HTMLSelectElement).value;
		channelList!.innerHTML = '';

		// Reset pagination and load new data
		currentPage = 1;
		await loadVisits(selectedChannel, currentPage);
	});
}


if (document.getElementById('channel-tabs2')) {
	// Add options for each channel
	const select = document.getElementById('channel-tabs2') as HTMLSelectElement;
	const channelList = document.getElementById('channel-list');
	const faqContainer = document.getElementById('faq'); // container with scroll

	channels.forEach((channel) => {
		const option = document.createElement('option');
		option.value = channel;
		option.text = channel;
		select.appendChild(option);
	});

	// Fetch data function
	async function fetchVisits(channel: string) {
		const response = await fetch(`https://api.epmarketingandresearch.com/api/usersByChannel?channel=${channel}`);
		const data = await response.json();
		return data.slice(0, 500); // Limit to top 500
	}

	// Load visits into the list
	async function loadVisits(channel: string) {
		if (channelList) showSkeletons(channelList as HTMLElement, 6);
		const data = await fetchVisits(channel);
		clearSkeletons(channelList as HTMLElement);

		// Add the data to the list
		data.forEach((visit: any) => {
			const li = document.createElement('li');
			li.classList.add('py-1', 'sm:py-2');

			li.innerHTML = `
				<button class="toggle-about-btn" data-public-id="${visit.public_id}" data-online="${visit.online ? 1 : 0}" data-name="${visit.name}">
					<div class="flex items-center justify-between cursor-pointer hover:bg-green-200">
						<div class="flex items-center min-w-0">
							<div class="ml-3 flex">
								<p class="mr-4 font-small text-gray-900 truncate dark:text-white" id="name">
									${visit.name}
								</p>
								<div class="flex items-center justify-end flex-1 text-sm ${visit.online ? 'text-green-500' : 'text-red-500'
				}">
									<span>${formatTime(visit.last_visit)}</span>
									<span class="mx-1">|</span>
									<span>${visit.online ? 'Online' : 'Offline'}</span>
								</div>
							</div>
						</div>
					</div>
				</button>
			`;

			li.querySelector('.toggle-about-btn')?.addEventListener('click', async () => {
				const aboutDiv = document.getElementById('about-tab');
				if (aboutDiv) aboutDiv.click();

				const btn = li.querySelector('.toggle-about-btn') as HTMLElement;
				const publicId = btn.getAttribute('data-public-id') || '';
				const onlineAttr = btn.getAttribute('data-online') || '0';
				const nameAttr = btn.getAttribute('data-name') || '';

				const userInput = document.getElementById('user-input') as HTMLInputElement;
				if (userInput) {
					userInput.value = (nameAttr || '').replace(/\s/g, '').replace('@', '');
				}

				const userInfo = document.getElementById('user-info') as HTMLElement;
				if (userInfo) {
					const isOnline = onlineAttr === '1';
					userInfo.innerHTML = isOnline ? 'Online' : 'Offline';
					userInfo.classList.toggle('text-green-500', isOnline);
					userInfo.classList.toggle('text-red-500', !isOnline);
				}

				await renderUserVisitsByQuery({ public_id: publicId });
			});

			channelList?.appendChild(li);
		});
	}

	// Initial load for the default channel
	let selectedChannel = channels[0] as string;
	await loadVisits(selectedChannel);

	// Reload data when a new channel is selected
	select.addEventListener('change', async (event) => {
		selectedChannel = (event.target as HTMLSelectElement).value;
		channelList!.innerHTML = ''; // Clear previous list
		await loadVisits(selectedChannel);
	});

	// Infinite scroll loading
	let loading = false;
	faqContainer?.addEventListener('scroll', async () => {
		if (
			faqContainer.scrollTop + faqContainer.clientHeight >= faqContainer.scrollHeight - 100 &&
			!loading
		) {
			loading = true;
			await loadVisits(selectedChannel);
			loading = false;
		}
	});
}

if (document.getElementById('user-input')) {
	let userInput = document.getElementById('user-input') as HTMLInputElement;
	let userList = document.getElementById('user-list');

	userInput.addEventListener('keydown', async (event: any) => {
		// if its enter
		if (event.key === 'Enter') {
			let user = (event.target as HTMLInputElement).value;
			let userInfo = document.getElementById('user-info') as HTMLElement;
			userInfo.innerHTML = ``;
			if (userList) showSkeletons(userList as HTMLElement, 4);

			// Check online status across all matching handles (names are not unique)
			let userData = await fetch(
				`https://api.epmarketingandresearch.com/api/user/getByName?name=@${user}`,
			);

			let userDataJson = await userData.json();
			let isAnyUserOnline = userDataJson.some(
				(user: any) => user.online,
			)
			if (isAnyUserOnline) {
				userInfo.innerHTML = 'Online';
				userInfo.classList.add('text-green-500');
				userInfo.classList.remove('text-red-500');
			} else {
				userInfo.innerHTML = 'Offline';
				userInfo.classList.add('text-red-500');
				userInfo.classList.remove('text-green-500');
			}

			await renderUserVisitsByQuery({ name: user });
			clearSkeletons(userList as HTMLElement);
		}
	});
}
// every 30sec trigger a change event on id channel-visits
// setInterval(() => {
// 	let channelVisits = document.getElementById('channel-tabs');
// 	channelVisits?.dispatchEvent(new Event('change'));

// 	let userVisits = document.getElementById('user-input');
// 	// create a enter key event
// 	let enterKey = new KeyboardEvent('keydown', { key: 'Enter' });
// 	userVisits?.dispatchEvent(enterKey);
// }, 30000);
if (document.getElementById('new-products-chart')) {
	const options = {
		colors: ['#1A56DB', '#FDBA8C'],
		series: [
			{
				name: 'Quantity',
				color: '#1A56DB',
				data: [
					{ x: '01 Feb', y: 170 },
					{ x: '02 Feb', y: 180 },
					{ x: '03 Feb', y: 164 },
					{ x: '04 Feb', y: 145 },
					{ x: '05 Feb', y: 194 },
					{ x: '06 Feb', y: 170 },
					{ x: '07 Feb', y: 155 },
				],
			},
		],
		chart: {
			type: 'bar',
			height: '140px',
			fontFamily: 'Inter, sans-serif',
			foreColor: '#4B5563',
			toolbar: {
				show: false,
			},
		},
		plotOptions: {
			bar: {
				columnWidth: '90%',
				borderRadius: 3,
			},
		},
		tooltip: {
			shared: false,
			intersect: false,
			style: {
				fontSize: '14px',
				fontFamily: 'Inter, sans-serif',
			},
		},
		states: {
			hover: {
				filter: {
					type: 'darken',
					value: 1,
				},
			},
		},
		stroke: {
			show: true,
			width: 5,
			colors: ['transparent'],
		},
		grid: {
			show: false,
		},
		dataLabels: {
			enabled: false,
		},
		legend: {
			show: false,
		},
		xaxis: {
			floating: false,
			labels: {
				show: false,
			},
			axisBorder: {
				show: false,
			},
			axisTicks: {
				show: false,
			},
		},
		yaxis: {
			show: false,
		},
		fill: {
			opacity: 1,
		},
	};

	const chart = new ApexCharts(
		document.getElementById('new-products-chart'),
		options,
	);
	chart.render();
}

if (document.getElementById('sales-by-category')) {
	const options = {
		colors: ['#1A56DB', '#FDBA8C'],
		series: [
			{
				name: 'Desktop PC',
				color: '#1A56DB',
				data: [
					{ x: '01 Feb', y: 170 },
					{ x: '02 Feb', y: 180 },
					{ x: '03 Feb', y: 164 },
					{ x: '04 Feb', y: 145 },
					{ x: '05 Feb', y: 194 },
					{ x: '06 Feb', y: 170 },
					{ x: '07 Feb', y: 155 },
				],
			},
			{
				name: 'Phones',
				color: '#FDBA8C',
				data: [
					{ x: '01 Feb', y: 120 },
					{ x: '02 Feb', y: 294 },
					{ x: '03 Feb', y: 167 },
					{ x: '04 Feb', y: 179 },
					{ x: '05 Feb', y: 245 },
					{ x: '06 Feb', y: 182 },
					{ x: '07 Feb', y: 143 },
				],
			},
			{
				name: 'Gaming/Console',
				color: '#17B0BD',
				data: [
					{ x: '01 Feb', y: 220 },
					{ x: '02 Feb', y: 194 },
					{ x: '03 Feb', y: 217 },
					{ x: '04 Feb', y: 279 },
					{ x: '05 Feb', y: 215 },
					{ x: '06 Feb', y: 263 },
					{ x: '07 Feb', y: 183 },
				],
			},
		],
		chart: {
			type: 'bar',
			height: '420px',
			fontFamily: 'Inter, sans-serif',
			foreColor: '#4B5563',
			toolbar: {
				show: false,
			},
		},
		plotOptions: {
			bar: {
				columnWidth: '90%',
				borderRadius: 3,
			},
		},
		tooltip: {
			shared: true,
			intersect: false,
			style: {
				fontSize: '14px',
				fontFamily: 'Inter, sans-serif',
			},
		},
		states: {
			hover: {
				filter: {
					type: 'darken',
					value: 1,
				},
			},
		},
		stroke: {
			show: true,
			width: 5,
			colors: ['transparent'],
		},
		grid: {
			show: false,
		},
		dataLabels: {
			enabled: false,
		},
		legend: {
			show: false,
		},
		xaxis: {
			floating: false,
			labels: {
				show: false,
			},
			axisBorder: {
				show: false,
			},
			axisTicks: {
				show: false,
			},
		},
		yaxis: {
			show: false,
		},
		fill: {
			opacity: 1,
		},
	};

	const chart = new ApexCharts(
		document.getElementById('sales-by-category'),
		options,
	);
	chart.render();
}

const getVisitorsChartOptions = () => {
	let visitorsChartColors = {} as any;

	if (document.documentElement.classList.contains('dark')) {
		visitorsChartColors = {
			fillGradientShade: 'dark',
			fillGradientShadeIntensity: 0.45,
		};
	} else {
		visitorsChartColors = {
			fillGradientShade: 'light',
			fillGradientShadeIntensity: 1,
		};
	}

	return {
		series: [
			{
				name: 'Visitors',
				data: [500, 590, 600, 520, 610, 550, 600],
			},
		],
		labels: [
			'01 Feb',
			'02 Feb',
			'03 Feb',
			'04 Feb',
			'05 Feb',
			'06 Feb',
			'07 Feb',
		],
		chart: {
			type: 'area',
			height: '305px',
			fontFamily: 'Inter, sans-serif',
			sparkline: {
				enabled: true,
			},
			toolbar: {
				show: false,
			},
		},
		fill: {
			type: 'gradient',
			gradient: {
				shade: visitorsChartColors.fillGradientShade,
				shadeIntensity: visitorsChartColors.fillGradientShadeIntensity,
			},
		},
		plotOptions: {
			area: {
				fillTo: 'end',
			},
		},
		theme: {
			monochrome: {
				enabled: true,
				color: '#1A56DB',
			},
		},
		tooltip: {
			style: {
				fontSize: '14px',
				fontFamily: 'Inter, sans-serif',
			},
		},
	};
};

const getSignupsChartOptions = () => {
	let signupsChartColors = {} as any;

	if (document.documentElement.classList.contains('dark')) {
		signupsChartColors = {
			backgroundBarColors: [
				'#374151',
				'#374151',
				'#374151',
				'#374151',
				'#374151',
				'#374151',
				'#374151',
			],
		};
	} else {
		signupsChartColors = {
			backgroundBarColors: [
				'#E5E7EB',
				'#E5E7EB',
				'#E5E7EB',
				'#E5E7EB',
				'#E5E7EB',
				'#E5E7EB',
				'#E5E7EB',
			],
		};
	}

	return {
		series: [
			{
				name: 'Users',
				data: [1334, 2435, 1753, 1328, 1155, 1632, 1336],
			},
		],
		labels: [
			'01 Feb',
			'02 Feb',
			'03 Feb',
			'04 Feb',
			'05 Feb',
			'06 Feb',
			'07 Feb',
		],
		chart: {
			type: 'bar',
			height: '140px',
			foreColor: '#4B5563',
			fontFamily: 'Inter, sans-serif',
			toolbar: {
				show: false,
			},
		},
		theme: {
			monochrome: {
				enabled: true,
				color: '#1A56DB',
			},
		},
		plotOptions: {
			bar: {
				columnWidth: '25%',
				borderRadius: 3,
				colors: {
					backgroundBarColors: signupsChartColors.backgroundBarColors,
					backgroundBarRadius: 3,
				},
			},
			dataLabels: {
				hideOverflowingLabels: false,
			},
		},
		xaxis: {
			floating: false,
			labels: {
				show: false,
			},
			axisBorder: {
				show: false,
			},
			axisTicks: {
				show: false,
			},
		},
		tooltip: {
			shared: true,
			intersect: false,
			style: {
				fontSize: '14px',
				fontFamily: 'Inter, sans-serif',
			},
		},
		states: {
			hover: {
				filter: {
					type: 'darken',
					value: 0.8,
				},
			},
		},
		fill: {
			opacity: 1,
		},
		yaxis: {
			show: false,
		},
		grid: {
			show: false,
		},
		dataLabels: {
			enabled: false,
		},
		legend: {
			show: false,
		},
	};
};

if (document.getElementById('week-signups-chart')) {
	const chart = new ApexCharts(
		document.getElementById('week-signups-chart'),
		getSignupsChartOptions(),
	);
	chart.render();

	// init again when toggling dark mode
	document.addEventListener('dark-mode', () => {
		chart.updateOptions(getSignupsChartOptions());
	});
}

const getTrafficChannelsChartOptions = () => {
	let trafficChannelsChartColors = {} as any;

	if (document.documentElement.classList.contains('dark')) {
		trafficChannelsChartColors = {
			strokeColor: '#1f2937',
		};
	} else {
		trafficChannelsChartColors = {
			strokeColor: '#ffffff',
		};
	}

	return {
		series: [70, 5, 25],
		labels: ['Desktop', 'Tablet', 'Phone'],
		colors: ['#16BDCA', '#FDBA8C', '#1A56DB'],
		chart: {
			type: 'donut',
			height: 400,
			fontFamily: 'Inter, sans-serif',
			toolbar: {
				show: false,
			},
		},
		responsive: [
			{
				breakpoint: 430,
				options: {
					chart: {
						height: 300,
					},
				},
			},
		],
		stroke: {
			colors: [trafficChannelsChartColors.strokeColor],
		},
		states: {
			hover: {
				filter: {
					type: 'darken',
					value: 0.9,
				},
			},
		},
		tooltip: {
			shared: true,
			followCursor: false,
			fillSeriesColor: false,
			inverseOrder: true,
			style: {
				fontSize: '14px',
				fontFamily: 'Inter, sans-serif',
			},
			x: {
				show: true,
				formatter(_: any, { seriesIndex, w }: any) {
					const label = w.config.labels[seriesIndex];
					return label;
				},
			},
			y: {
				formatter(value: any) {
					return `${value}%`;
				},
			},
		},
		grid: {
			show: false,
		},
		dataLabels: {
			enabled: false,
		},
		legend: {
			show: false,
		},
	};
};

if (document.getElementById('traffic-by-device')) {
	const chart = new ApexCharts(
		document.getElementById('traffic-by-device'),
		getTrafficChannelsChartOptions(),
	);
	chart.render();

	// init again when toggling dark mode
	document.addEventListener('dark-mode', () => {
		chart.updateOptions(getTrafficChannelsChartOptions());
	});
}
