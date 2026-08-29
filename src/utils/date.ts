export function getCurrentDate(timezone: string): string {
	const parts = new Intl.DateTimeFormat('en-CA', {
		timeZone: timezone,
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
	}).formatToParts(new Date());

	const year = parts.find((part) => part.type === 'year')?.value;

	const month = parts.find((part) => part.type === 'month')?.value;

	const day = parts.find((part) => part.type === 'day')?.value;

	return `${year}-${month}-${day}`;
}

export function getCurrentWeekDates(timezone: string): string[] {
	const now = new Date();

	const local = new Intl.DateTimeFormat('en-CA', {
		timeZone: timezone,
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
	}).format(now);

	const [year, month, day] = local.split('-').map(Number);

	const date = new Date(Date.UTC(year, month - 1, day));

	const dayOfWeek = date.getUTCDay();

	// Monday = 0
	const daysFromMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;

	const monday = new Date(date);

	monday.setUTCDate(date.getUTCDate() - daysFromMonday);

	const dates: string[] = [];

	for (let i = 0; i < 7; i++) {
		const current = new Date(monday);

		current.setUTCDate(monday.getUTCDate() + i);

		dates.push(current.toISOString().slice(0, 10));
	}

	return dates;
}

export function getMonthWeeks(timezone: string): string[][] {
	const now = new Date();

	const local = new Intl.DateTimeFormat('en-CA', {
		timeZone: timezone,
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
	}).format(now);

	const [year, month] = local.split('-').map(Number);

	const firstDay = new Date(Date.UTC(year, month - 1, 1));

	const lastDay = new Date(Date.UTC(year, month, 0));

	const firstWeekday = firstDay.getUTCDay();

	const daysFromMonday = firstWeekday === 0 ? 6 : firstWeekday - 1;

	const firstMonday = new Date(firstDay);

	firstMonday.setUTCDate(firstDay.getUTCDate() - daysFromMonday);

	const weeks: string[][] = [];

	let currentMonday = new Date(firstMonday);

	while (currentMonday <= lastDay) {
		const week: string[] = [];

		for (let i = 0; i < 7; i++) {
			const current = new Date(currentMonday);

			current.setUTCDate(currentMonday.getUTCDate() + i);

			week.push(current.toISOString().slice(0, 10));
		}

		weeks.push(week);

		currentMonday = new Date(currentMonday);

		currentMonday.setUTCDate(currentMonday.getUTCDate() + 7);
	}

	return weeks;
}
