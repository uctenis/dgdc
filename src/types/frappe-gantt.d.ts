// frappe-gantt (MIT) no publica tipos: aquí va solo lo que usa la app (ver GanttFases.tsx).
declare module 'frappe-gantt' {
  export interface TareaGantt {
    id: string;
    name: string;
    /** YYYY-MM-DD */
    start: string;
    /** YYYY-MM-DD, último día incluido. */
    end: string;
    progress?: number;
    color?: string;
    description?: string;
  }

  export interface ContextoPopupGantt {
    task: TareaGantt & { _start: Date; _end: Date; actual_duration: number };
    set_title: (html: string) => void;
    set_subtitle: (html: string) => void;
    set_details: (html: string) => void;
  }

  export interface OpcionesGantt {
    view_mode?: 'Day' | 'Week' | 'Month';
    language?: string;
    bar_height?: number;
    padding?: number;
    infinite_padding?: boolean;
    scroll_to?: 'start' | 'end' | 'today' | string | null;
    today_button?: boolean;
    view_mode_select?: boolean;
    readonly?: boolean;
    readonly_progress?: boolean;
    popup_on?: 'click' | 'hover';
    popup?: ((ctx: ContextoPopupGantt) => void) | false;
    /** `end` es el último día incluido (a las 23:59:59). Se dispara mientras se arrastra la barra. */
    on_date_change?: (task: TareaGantt, start: Date, end: Date) => void;
  }

  export default class Gantt {
    constructor(wrapper: HTMLElement | SVGElement | string, tasks: TareaGantt[], options?: OpcionesGantt);
    /** Rango de fechas que abarca la grilla y contenedor con el desplazamiento horizontal. */
    gantt_start?: Date;
    gantt_end?: Date;
    $container?: HTMLElement;
    setup_tasks(tasks: TareaGantt[]): void;
    refresh(tasks: TareaGantt[]): void;
    change_view_mode(mode?: string, maintainPos?: boolean): void;
    clear(): void;
  }
}
