export interface FormattedSession {
	lines: string[];
	totalMinutes: number;
	hasNightMinutes: boolean;
}

export interface TimeRange {
	start: string;
	end: string;
}

export interface GameTimeRange {
	gameId: number;
	start: string;
	end: string;
	scheduledTime: string;
}

export interface GameTimeGroup {
	gameIds: number[];
	start: string;
	end: string;
}

export function timeToMinutes(time: string): number {
	const [hours, minutes] = time.split(':').map(Number);

	return hours * 60 + minutes;
}

export function minutesToDuration(totalMinutes: number): string {
	const hours = Math.floor(totalMinutes / 60);
	const minutes = totalMinutes % 60;

	if (hours === 0) {
		return `${minutes}m`;
	}

	if (minutes === 0) {
		return `${hours}h`;
	}

	return `${hours}h ${minutes}m`;
}

export function formatWorkSession(clockIn: string, clockOut: string, nightStart: string): FormattedSession {
	const start = timeToMinutes(clockIn);
	const end = timeToMinutes(clockOut);
	const night = timeToMinutes(nightStart);

	if (end < start) {
		return {
			lines: [],
			totalMinutes: 0,
			hasNightMinutes: false,
		};
	}

	const totalMinutes = end - start;

	// session before night_start
	if (end <= night) {
		return {
			lines: [`${clockIn}-${clockOut} = <b>${minutesToDuration(totalMinutes)}</b>`],
			totalMinutes,
			hasNightMinutes: false,
		};
	}

	// session began in the night
	if (start >= night) {
		return {
			lines: [`🌙${clockIn}-${clockOut} = <b>${minutesToDuration(totalMinutes)}</b>`],
			totalMinutes,
			hasNightMinutes: true,
		};
	}

	// session overlaped night_start
	const dayMinutes = night - start;
	const nightMinutes = end - night;

	return {
		lines: [
			`${clockIn}-${nightStart} = <b>${minutesToDuration(dayMinutes)}</b>`,
			`🌙${nightStart}-${clockOut} = <b>${minutesToDuration(nightMinutes)}</b>`,
		],
		totalMinutes,
		hasNightMinutes: true,
	};
}

export function mergeTimeRanges(ranges: TimeRange[]): TimeRange[] {
	if (ranges.length === 0) {
		return [];
	}

	const sorted = [...ranges].sort((a, b) => timeToMinutes(a.start) - timeToMinutes(b.start));

	const merged: TimeRange[] = [sorted[0]];

	for (let i = 1; i < sorted.length; i++) {
		const current = sorted[i];
		const last = merged[merged.length - 1];

		const currentStart = timeToMinutes(current.start);
		const currentEnd = timeToMinutes(current.end);
		const lastEnd = timeToMinutes(last.end);

		if (currentStart <= lastEnd) {
			if (currentEnd > lastEnd) {
				last.end = current.end;
			}
		} else {
			merged.push(current);
		}
	}

	return merged;
}

export function groupContinuousGames(ranges: GameTimeRange[]): GameTimeGroup[] {
	if (ranges.length === 0) {
		return [];
	}

	const sorted = [...ranges].sort((a, b) => timeToMinutes(a.start) - timeToMinutes(b.start));

	const groups: {
		games: GameTimeRange[];
		start: string;
		end: string;
	}[] = [
		{
			games: [sorted[0]],
			start: sorted[0].start,
			end: sorted[0].end,
		},
	];

	for (let i = 1; i < sorted.length; i++) {
		const current = sorted[i];
		const lastGroup = groups[groups.length - 1];

		const currentStart = timeToMinutes(current.start);

		const lastEnd = timeToMinutes(lastGroup.end);

		if (currentStart <= lastEnd) {
			lastGroup.games.push(current);

			if (timeToMinutes(current.end) > timeToMinutes(lastGroup.end)) {
				lastGroup.end = current.end;
			}
		} else {
			groups.push({
				games: [current],
				start: current.start,
				end: current.end,
			});
		}
	}

	return groups.map((group) => {
		const gamesByScheduledTime = [...group.games].sort((a, b) => timeToMinutes(a.scheduledTime) - timeToMinutes(b.scheduledTime));

		return {
			gameIds: gamesByScheduledTime.map((game) => game.gameId),
			start: group.start,
			end: group.end,
		};
	});
}
