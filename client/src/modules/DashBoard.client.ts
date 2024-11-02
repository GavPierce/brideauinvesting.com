/* eslint-disable max-lines */

import ApexCharts from 'apexcharts';

let responseData = await fetch('https://api.brideauinvesting.com/api/getChannels');
let channelObject = await responseData.json() as {channels: string[]};
let channels = channelObject.channels as string[];
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

const chartData = await Promise.all(
	channels.map(async (channel) => {
		const response = await fetch(
			`https://api.brideauinvesting.com/api/visits/daily/lastSevenDays?channel=${channel}`,
		);
		// Adjust the date range
		const data = await response.json();
		data.forEach((visit: any) => {
			// date as Month - Day
			let dateFormat = `${formatToLocalMonthDay(visit.visit_date)}`;
			if (!xAxisDates.includes(dateFormat)) {
				xAxisDates.push(dateFormat);
			}
		});
		// Format the data for ApexCharts
		// it is possible that the data returned might be missing a date if no visits have been made on that day

		let dataArray = [] as number[];
		// Check to see if there is a missing date, and then add 0 to an array

		// first we want to take the data and convert it to local time, and add count to for each day.

		for (let i = 0; i < data.length; i++) {
			let visit = data[i];

			let visitDate = new Date(visit.visit_date);

			let nextVisitDate = new Date();
			if (i < data.length - 1) {
				nextVisitDate = new Date(data[i + 1]?.visit_date);
			}

			// check to see if there is more then 24 hours between visits

			if (nextVisitDate.getTime() - visitDate.getTime() > 24 * 60 * 60 * 1000) {
				// the count and then another count of zero for the next day
				dataArray.push(visit.visit_count);

				// get how many days between
				let gap =
					(nextVisitDate.getTime() - visitDate.getTime()) /
					(24 * 60 * 60 * 1000);

				for (let j = 1; j < gap; j++) {
					dataArray.push(0);
				}
			} else {
				// there's no gap we can just add the count and proceed to next day
				dataArray.push(visit.visit_count);
			}
		}

		return {
			name: channel,
			data: dataArray, // Extract visit count for each day
			color: getColorForChannel(channel), // Helper function to get the color for each channel
		};
	}),
);
//sort axis dates chronological
xAxisDates.sort((a, b) => {
	const dateA = new Date(a);
	const dateB = new Date(b);
	return dateA.getTime() - dateB.getTime();
});
const getMainChartOptions = () => {
	let mainChartColors = {} as any;

	if (document.documentElement.classList.contains('dark')) {
		mainChartColors = {
			borderColor: '#374151',
			labelColor: '#9CA3AF',
			opacityFrom: 0,
			opacityTo: 0.15,
		};
	} else {
		mainChartColors = {
			borderColor: '#F3F4F6',
			labelColor: '#6B7280',
			opacityFrom: 0.45,
			opacityTo: 0,
		};
	}

	return {
		chart: {
			height: 420,
			type: 'area',
			fontFamily: 'Inter, sans-serif',
			foreColor: mainChartColors.labelColor,
			toolbar: {
				show: false,
			},
		},
		fill: {
			type: 'gradient',
			gradient: {
				enabled: true,
				opacityFrom: mainChartColors.opacityFrom,
				opacityTo: mainChartColors.opacityTo,
			},
		},
		dataLabels: {
			enabled: false,
		},
		tooltip: {
			style: {
				fontSize: '14px',
				fontFamily: 'Inter, sans-serif',
			},
		},
		grid: {
			show: true,
			borderColor: mainChartColors.borderColor,
			strokeDashArray: 1,
			padding: {
				left: 35,
				bottom: 15,
			},
		},
		series: chartData,
		markers: {
			size: 5,
			strokeColors: '#ffffff',
			hover: {
				size: undefined,
				sizeOffset: 3,
			},
		},
		xaxis: {
			categories: xAxisDates,
			labels: {
				style: {
					colors: [mainChartColors.labelColor],
					fontSize: '14px',
					fontWeight: 500,
				},
			},
			axisBorder: {
				color: mainChartColors.borderColor,
			},
			axisTicks: {
				color: mainChartColors.borderColor,
			},
			crosshairs: {
				show: true,
				position: 'back',
				stroke: {
					color: mainChartColors.borderColor,
					width: 1,
					dashArray: 10,
				},
			},
		},
		yaxis: {
			labels: {
				style: {
					colors: [mainChartColors.labelColor],
					fontSize: '14px',
					fontWeight: 500,
				},
				formatter(value: any) {
					return `${value}`;
				},
			},
		},
		legend: {
			fontSize: '14px',
			fontWeight: 500,
			fontFamily: 'Inter, sans-serif',
			labels: {
				colors: [mainChartColors.labelColor],
			},
			itemMargin: {
				horizontal: 10,
			},
		},
		responsive: [
			{
				breakpoint: 1024,
				options: {
					xaxis: {
						labels: {
							show: false,
						},
					},
				},
			},
		],
	};
};

if (document.getElementById('main-chart')) {
	const chart = new ApexCharts(
		document.getElementById('main-chart'),
		getMainChartOptions(),
	);
	chart.render();

	// init again when toggling dark mode
	document.addEventListener('dark-mode', () => {
		chart.updateOptions(getMainChartOptions());
	});
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
if (document.getElementById('channel-tabs1')) {
	// update channelList

	// add options for each channel
	let select = document.getElementById('channel-tabs1') as HTMLSelectElement;
	channels.forEach((channel) => {
		let option = document.createElement('option');
		option.value = channel;
		option.text = channel;
		select.appendChild(option);
	});
	const response = await fetch(
		`https://api.brideauinvesting.com/api/visitsByChannel?channel=bbb`,
	);
	// Adjust the date range
	const data = await response.json();
	let channelList = document.getElementById('visits-list');

	// data format:
	/**
	 *name: "@contrarian", online: 1,timestamp: "2024-09-30T18:03:33.841Z"
	 */
	// Add the data to the list
	data.forEach((visit: any) => {
		let li = document.createElement('li');
		li.classList.add('py-1', 'sm:py-1');

		// Create the inner HTML dynamically with user info and formatted timestamp
		li.innerHTML = `
<button class="toggle-about-btn">
		  <div class="flex items-center justify-between cursor-pointer hover:bg-blue-200">
			<div class="flex items-center min-w-0">
			  <div class="ml-3 flex">
				<p class="mr-4 font-small text-gray-900 truncate dark:text-white" id="name">
				  ${visit.name} <!-- Replace with actual username -->
				</p>
				<div class="flex items-center justify-end flex-1 text-sm ${
					visit.online ? 'text-green-500' : 'text-red-500'
				} ">
				  
				  <span>${formatTime(visit.timestamp)}</span>
				  <span class="mx-1">|</span>
				  <span>${visit.online ? 'Online' : 'Offline'}</span>
				</div>
			  </div>
			</div>

		  </div>
		  </button>
		`;
		li.querySelector('.toggle-about-btn')?.addEventListener(
			'click',
			function () {
				const aboutDiv = document.getElementById('about-tab');
				// click on tab
				if (aboutDiv) {
					aboutDiv.click();
				}
				// get name from li -> p with id name
				const name = li.querySelector('#name')?.textContent;
				// remove whitespace and @ symbol
				const nameWithoutWhitespace = name
					?.replace(/\s/g, '')
					.replace('@', '') as string;
				//insert name into userInput
				const userInput = document.getElementById(
					'user-input',
				) as HTMLInputElement;
				if (userInput) {
					userInput.value = nameWithoutWhitespace;
					// send Enter event
					userInput.dispatchEvent(
						new KeyboardEvent('keydown', { key: 'Enter' }),
					);
				}
			},
		);
		channelList?.appendChild(li);
	});
	// conosle log when a channel is selected
	select.addEventListener('change', async (event) => {
		let channel = (event.target as HTMLSelectElement).value;

		// remove all LI items in id channel-list
		let channelList = document.getElementById('visits-list');
		while (channelList?.firstChild) {
			channelList.removeChild(channelList.firstChild);
		}

		const response = await fetch(
			`https://api.brideauinvesting.com/api/visitsByChannel?channel=${channel}`,
		);
		// Adjust the date range
		let data = await response.json();
		// jsut get top 500
		data = data.slice(0, 500);
		// data format:
		/**
		 *name: "@contrarian", online: 1,timestamp: "2024-09-30T18:03:33.841Z"
		 */
		// Add the data to the list
		data.forEach((visit: any) => {
			let li = document.createElement('li');
			li.classList.add('py-1', 'sm:py-2');

			// Create the inner HTML dynamically with user info and formatted timestamp
			li.innerHTML = `
			<button class="toggle-about-btn">
					  <div class="flex items-center justify-between cursor-pointer hover:bg-blue-200">
						<div class="flex items-center min-w-0">
						  <div class="ml-3 flex">
							<p class="mr-4 font-small text-gray-900 truncate dark:text-white" id="name">
							  ${visit.name} <!-- Replace with actual username -->
							</p>
							<div class="flex items-center justify-end flex-1 text-sm ${
								visit.online ? 'text-green-500' : 'text-red-500'
							} ">
							  
							  <span>${formatTime(visit.timestamp)}</span>
							  <span class="mx-1">|</span>
							  <span>${visit.online ? 'Online' : 'Offline'}</span>
							</div>
						  </div>
						</div>
			
					  </div>
					  </button>
					`;
			li.querySelector('.toggle-about-btn')?.addEventListener(
				'click',
				function () {
					const aboutDiv = document.getElementById('about-tab');
					// click on tab
					if (aboutDiv) {
						aboutDiv.click();
					}
					// get name from li -> p with id name
					const name = li.querySelector('#name')?.textContent;
					// remove whitespace and @ symbol
					const nameWithoutWhitespace = name
						?.replace(/\s/g, '')
						.replace('@', '') as string;
					//insert name into userInput
					const userInput = document.getElementById(
						'user-input',
					) as HTMLInputElement;
					if (userInput) {
						userInput.value = nameWithoutWhitespace;
						// send Enter event
						userInput.dispatchEvent(
							new KeyboardEvent('keydown', { key: 'Enter' }),
						);
					}
				},
			);

			channelList?.appendChild(li);
		});
	});
}
if (document.getElementById('channel-tabs2')) {
	// add options for each channel
	let select = document.getElementById('channel-tabs2') as HTMLSelectElement;
	channels.forEach((channel) => {
		let option = document.createElement('option');
		option.value = channel;
		option.text = channel;
		select.appendChild(option);
	});
	const response = await fetch(
		`https://api.brideauinvesting.com/api/usersByChannel?channel=bbb`,
	);
	// Adjust the date range
	const data = await response.json();
	let channelList = document.getElementById('channel-list');

	// data format:
	/**
	 *name: "@contrarian", online: 1,timestamp: "2024-09-30T18:03:33.841Z"
	 */
	// Add the data to the list
	data.forEach((visit: any) => {
		let li = document.createElement('li');
		li.classList.add('py-1', 'sm:py-1');

		// Create the inner HTML dynamically with user info and formatted timestamp
		li.innerHTML = `
<button class="toggle-about-btn">
		  <div class="flex items-center justify-between cursor-pointer hover:bg-green-200">
			<div class="flex items-center min-w-0">
			  <div class="ml-3 flex">
				<p class="mr-4 font-small text-gray-900 truncate dark:text-white" id="name">
				  ${visit.name} <!-- Replace with actual username -->
				</p>
				<div class="flex items-center justify-end flex-1 text-sm ${
					visit.online ? 'text-green-500' : 'text-red-500'
				} ">
				  
				  <span>${formatTime(visit.last_visit)}</span>
				  <span class="mx-1">|</span>
				  <span>${visit.online ? 'Online' : 'Offline'}</span>
				</div>
			  </div>
			</div>

		  </div>
		  </button>
		`;
		li.querySelector('.toggle-about-btn')?.addEventListener(
			'click',
			function () {
				const aboutDiv = document.getElementById('about-tab');
				// click on tab
				if (aboutDiv) {
					aboutDiv.click();
				}
				// get name from li -> p with id name
				const name = li.querySelector('#name')?.textContent;
				// remove whitespace and @ symbol
				const nameWithoutWhitespace = name
					?.replace(/\s/g, '')
					.replace('@', '') as string;
				//insert name into userInput
				const userInput = document.getElementById(
					'user-input',
				) as HTMLInputElement;
				if (userInput) {
					userInput.value = nameWithoutWhitespace;
					// send Enter event
					userInput.dispatchEvent(
						new KeyboardEvent('keydown', { key: 'Enter' }),
					);
				}
			},
		);
		channelList?.appendChild(li);
	});
	// conosle log when a channel is selected
	select.addEventListener('change', async (event) => {
		let channel = (event.target as HTMLSelectElement).value;

		// remove all LI items in id channel-list
		let channelList = document.getElementById('channel-list');
		while (channelList?.firstChild) {
			channelList.removeChild(channelList.firstChild);
		}

		const response = await fetch(
			`https://api.brideauinvesting.com/api/usersByChannel?channel=${channel}`,
		);
		// Adjust the date range
		let data = await response.json();
		// jsut get top 500
		data = data.slice(0, 500);
		// data format:
		/**
		 *name: "@contrarian", online: 1,timestamp: "2024-09-30T18:03:33.841Z"
		 */
		// Add the data to the list
		data.forEach((visit: any) => {
			let li = document.createElement('li');
			li.classList.add('py-1', 'sm:py-2');

			// Create the inner HTML dynamically with user info and formatted timestamp
			li.innerHTML = `
			<button class="toggle-about-btn">
					  <div class="flex items-center justify-between cursor-pointer hover:bg-green-200">
						<div class="flex items-center min-w-0">
						  <div class="ml-3 flex">
							<p class="mr-4 font-small text-gray-900 truncate dark:text-white" id="name">
							  ${visit.name} <!-- Replace with actual username -->
							</p>
							<div class="flex items-center justify-end flex-1 text-sm ${
								visit.online ? 'text-green-500' : 'text-red-500'
							} ">
							  
							  <span>${formatTime(visit.last_visit)}</span>
							  <span class="mx-1">|</span>
							  <span>${visit.online ? 'Online' : 'Offline'}</span>
							</div>
						  </div>
						</div>
			
					  </div>
					  </button>
					`;
			li.querySelector('.toggle-about-btn')?.addEventListener(
				'click',
				function () {
					const aboutDiv = document.getElementById('about-tab');
					// click on tab
					if (aboutDiv) {
						aboutDiv.click();
					}
					// get name from li -> p with id name
					const name = li.querySelector('#name')?.textContent;
					// remove whitespace and @ symbol
					const nameWithoutWhitespace = name
						?.replace(/\s/g, '')
						.replace('@', '') as string;
					//insert name into userInput
					const userInput = document.getElementById(
						'user-input',
					) as HTMLInputElement;
					if (userInput) {
						userInput.value = nameWithoutWhitespace;
						// send Enter event
						userInput.dispatchEvent(
							new KeyboardEvent('keydown', { key: 'Enter' }),
						);
					}
				},
			);

			channelList?.appendChild(li);
		});
	});
}
if (document.getElementById('user-input')) {
	let userInput = document.getElementById('user-input') as HTMLInputElement;
	let userList = document.getElementById('user-list');

	userInput.addEventListener('keydown', async (event: any) => {
		// if its enter
		if (event.key === 'Enter') {
			while (userList?.firstChild) {
				userList.removeChild(userList.firstChild);
			}
			let user = (event.target as HTMLInputElement).value;
			let userInfo = document.getElementById('user-info') as HTMLElement;
			userInfo.innerHTML = `Loading...`;

			// get user data
			const response = await fetch(
				`https://api.brideauinvesting.com/api/visitsByUser?user=@${user}`,
			);
			let data = await response.json();
			let userData = await fetch(
				`https://api.brideauinvesting.com/api/user/getByName?name=@${user}`,
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
			// Add the data to the list
			data.forEach((visit: any) => {
				let li = document.createElement('li');
				li.classList.add('py-3', 'sm:py-4');

				// Create the inner HTML dynamically with user info and formatted timestamp
				li.innerHTML = `
							<div class="flex items-center space-x-4">

								<div class="flex-1 min-w-0">
									<p class="font-medium text-gray-900 truncate dark:text-white">
										${formatTime(visit.timestamp)}
									</p>
						
								</div>
								<div
									class="inline-flex items-center text-base font-semibold text-gray-900 dark:text-white"
								>
									${visit.channel_name}
								</div>
							</div>
				`;

				userList?.appendChild(li);
			});
		}
	});
}
// every 30sec trigger a change event on id channel-visits
setInterval(() => {
	let channelVisits = document.getElementById('channel-tabs');
	channelVisits?.dispatchEvent(new Event('change'));

	let userVisits = document.getElementById('user-input');
	// create a enter key event
	let enterKey = new KeyboardEvent('keydown', { key: 'Enter' });
	userVisits?.dispatchEvent(enterKey);
}, 30000);
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
