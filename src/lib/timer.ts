class Timer {
    dateStart: Date;
    constructor() {
        this.dateStart = new Date();
    }
    get seconds() {
        return Math.abs((new Date().getTime() - this.dateStart.getTime()) / 1000);
    }
}
export default Timer;