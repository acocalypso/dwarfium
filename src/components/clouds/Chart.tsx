import { Line } from 'react-chartjs-2';

export interface ChartDataProps {
    forecastTimes: string[];
    cloudArray: string[];
    humidityArray: string[];
    windArray: string[];
}

const CustomChart = ({
    forecastTimes,
    cloudArray,
    humidityArray,
    windArray,
}: ChartDataProps) => {
    return (
        <div className="chart-container">
            <Line
                data={{
                    labels: forecastTimes,
                    datasets: [
                        {
                            label: 'Cloud cover (%)',
                            data: cloudArray,
                            fill: false,
                            borderColor: 'rgba(255, 99, 132, 0.8)',
                            tension: 0.4,
                        },
                        {
                            label: 'Humidity (%)',
                            data: humidityArray,
                            fill: false,
                            borderColor: 'rgba(54, 162, 235, 0.8)',
                            tension: 0.4,
                        },
                        {
                            label: 'Wind speed (km/hr)',
                            data: windArray,
                            fill: false,
                            borderColor: 'rgba(255, 206, 86, 0.8)',
                            tension: 0.4,
                        },
                    ],
                }}
                options={{
                    maintainAspectRatio: false,
                    responsive: true,
                    plugins: {
                        title: {
                            display: true,
                            text: 'Clouds Forecast',
                            font: {
                                size: 24,
                                weight: 'bold',
                            },
                            padding: 20, // Add padding to the title
                            color: '#fff', // Text color
                        },
                        legend: {
                            display: true,
                            labels: {
                                font: {
                                    size: 16,
                                },
                                padding: 10, // Add padding to the title
                                color: '#fff', // Text color
                            },
                        },
                    },
                    scales: {
                        x: {
                            display: true,
                            grid: {
                                display: true,
                                color: 'rgba(255, 255, 255, 0.2)',
                            },
                            ticks: {
                                color: 'white',
                                font: {
                                    size: 14,
                                },
                            },
                        },
                        y: {
                            display: true,
                            grid: {
                                display: true,
                                color: 'rgba(255, 255, 255, 0.2)',
                            },
                            ticks: {
                                color: 'white',
                                font: {
                                    size: 14,
                                },
                            },
                        },
                    },
                }}
            />
        </div>
    );
};

export default CustomChart;
