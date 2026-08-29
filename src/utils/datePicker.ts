export type DateAction = 'add' | 'in' | 'out' | 'edit';

export function getDatePickerKeyboard(action: DateAction) {
	return {
		inline_keyboard: [
			[
				{
					text: 'Hoy',
					callback_data: `date:${action}:today`,
				},
				{
					text: 'Ayer',
					callback_data: `date:${action}:yesterday`,
				},
				{
					text: 'Anteayer',
					callback_data: `date:${action}:before_yesterday`,
				},
			],
			[
				{
					text: '📅 Otra fecha',
					callback_data: `date:${action}:custom`,
				},
			],
		],
	};
}
