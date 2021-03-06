import React, { Component } from 'react';
import { Line } from 'react-chartjs-2';
let moment = require('moment');
require('twix');

class StockChart extends Component {
  constructor(props) {
    super(props);
    this.currentChartStocks = this.currentChartStocks.bind(this);
    this.currentChartCorrs = this.currentChartCorrs.bind(this);
    this.updateCurrentStocks = this.updateCurrentStocks.bind(this);
    this.addStockData = this.addStockData.bind(this);
    this.updateDateRange = this.updateDateRange.bind(this);
    this.updateChartData = this.updateChartData.bind(this);
    this.normalizeChartData = this.normalizeChartData.bind(this);
    this.removeChartStocks = this.removeChartStocks.bind(this);
    this.tooltipStock = this.tooltipStock.bind(this);

    this.state = {
      stockData: {
        dates: [],
        prices: {},
        correlations: {},
        normalized: props.normalized,
        startInd: 0,
        endInd: 0
      },
      stockChartData: {
        labels: [],
        datasets: []
      },
      corrChartData: {
        labels: [],
        datasets: []
      }
    };
  }

  render() {

    let corrData = this.state.corrChartData.datasets.length > 0;
    let stockOptions = this.state.stockData.normalized ? percentOptions : dollarOptions;
    stockOptions = copy(stockOptions);
    stockOptions.scales.yAxes[0].ticks.callback = this.state.stockData.normalized ? percentCallback : dollarCallback;
    stockOptions.tooltips.callbacks.title = () => null;
    stockOptions.tooltips.callbacks.label = this.tooltipStock;
    stockOptions.tooltips.callbacks.beforeFooter = (tooltipItem, data) => 'Date: '+tooltipItem[0].xLabel;
    stockOptions.tooltips.callbacks.afterFooter = this.state.stockData.normalized ? percentTooltip : dollarTooltip;
    if(corrData)
      stockOptions.scales.xAxes[0].ticks.fontColor = '#FFF';

    return (
      <div>

        {/*Stock Line Chart*/}
        <Line data={this.state.stockChartData} options={stockOptions}/>

        {/*Correlation Line Chart*/}
        {corrData && <div style={{marginTop: '-70px'}}>
          <Line data={this.state.corrChartData} options={corrOptions}/>
        </div>}

      </div>);
  }

  componentDidMount() {
    this.updateCurrentStocks([], this.props.displayStocks);
  }

  componentWillReceiveProps(nextProps) {

    if (this.props.startDate !== nextProps.startDate || this.props.endDate !== nextProps.endDate)
      this.updateDateRange(nextProps.startDate, nextProps.endDate);
    else if(this.props.normalized !== nextProps.normalized)
      this.normalizeChartData(nextProps.normalized);
    else {
      this.updateCurrentStocks(this.props.displayStocks, nextProps.displayStocks);

      let newStocks = arr_diff(nextProps.correlationStocks, this.currentChartCorrs());
      if (newStocks.length>0){

        let path;
        let stocks = newStocks[0].slice(8,newStocks[0].indexOf(' )')).split(' , ');
        if(stocks[0].indexOf('DEX')>-1)
          path = '/api/stocks/corr/curr?currency=' + stocks[0] + '&stock=' + stocks[1];
        else if(stocks[1].indexOf('DEX')>-1)
          path = '/api/stocks/corr/curr?stock=' + stocks[0] + '&currency=' + stocks[1];
        else
          path = '/api/stocks/corr/stocks?stock1=' + stocks[0] + '&stock2=' + stocks[1];

        newStocks.forEach(stock => fetch(path).then(res => res.json())
          .then(newStockData => this.addStockData(newStockData, 'correlations')));
      }
    }
  }

  updateCurrentStocks(currentStocks, nextStocks) {
    let newStocks = arr_diff(nextStocks, currentStocks);
    let delStocks = arr_diff(currentStocks, nextStocks);

    if (newStocks.length>0)
      newStocks.forEach(stock =>
        fetch('/api/stocks/' + stock).then(res => res.json())
          .then(newStockData => this.addStockData(newStockData)));
    else if (delStocks.length>0)
      this.removeChartStocks(delStocks);
  }

  updateDateRange(startDate, endDate, newStock=null) {

    ['stockChartData', 'corrChartData'].forEach((dataType) => {
      let chartData = this.state[dataType];
      let stockData = this.state.stockData;

      if (this.state.stockData.dates.length === 0) {
        let itr = moment.twix(startDate,endDate).iterate("days");
        let range=[];
        while(itr.hasNext()){ range.push(itr.next().format('YYYY-MM-DD')); }
        chartData.labels = range;
      } else {
        let startInd = binSearch(startDate, stockData.dates);
        let endInd = binSearch(endDate, stockData.dates);
        stockData.startInd = startInd; stockData.endInd = endInd;
        this.setState({ stockData });
        chartData.labels = stockData.dates.slice(startInd, endInd+1);
        chartData.datasets.map((dataSet) => {
          dataSet.data = stockData.prices[dataSet.label].slice(startInd, endInd+1);
          return dataSet;
        });
      }
      this.setState({ chartData });
    });

    if(newStock) this.updateChartData(newStock);
  }

  currentChartStocks() {return this.state.stockChartData.datasets.map(dataSet => dataSet.label)}
  currentChartCorrs() {return this.state.corrChartData.datasets.map(dataSet => dataSet.label)}

  // Take the new api stock data and add it to the current state
  addStockData(newStockData, metric='prices') {
    if(newStockData.dates.length===0)
      return this.props.noCorrData(newStockData);

    let stockData = this.state.stockData;

    let updateDates = false;
    if (stockData.dates.length === 0) {   // if this is the first stock we are adding
      stockData.dates = newStockData.dates; // update our state with the new stock data dates
      updateDates = true;                   // then update the date range
    }
    else if ( !(stockData.dates[0] === newStockData.dates[0] &&  // check that the stock dates are consistent
                stockData.dates.length === newStockData.dates.length &&
                stockData.dates[stockData.dates.length-1] === newStockData.dates[newStockData.dates.length - 1]))
      return console.error(newStockData.stock+' stock date ranges are inconsistent!');

    // add the new stock prices to our state
    let name = metric==='prices' ? newStockData.stock : correlationLabel(newStockData);
    stockData[metric][name] = newStockData[metric];
    this.setState({ stockData });

    // Update the date range first or directly update the chart data
    if(updateDates) this.updateDateRange(this.props.startDate, this.props.endDate, newStockData);
    else this.updateChartData(newStockData, metric);
  }

  // add the new stock data to the stockChartData
  updateChartData(newStockData, metric='prices'){
    if(newStockData.dates.length > 0) {   // if we have some stock data

      let stockData = this.state.stockData;
      let chartData = metric==='prices' ? this.state.stockChartData : this.state.corrChartData;
      let dataSet = JSON.parse(origDataSet);


      // create a new chart dataset for the new stock
      let color;
      if(metric==='prices'){
        let stockName = newStockData.stock;
        dataSet.label = stockName;
        let stockButton = document.getElementById("plot-"+stockName);
        if(stockButton && stockButton.style["background-color"])
          color = stockButton.style["background-color"];
        else{
          color = getRandomColor(); // generate a random color for the new data set
          stockButton.style["background-color"] = color;
        }
      } else {
        color = getRandomColor(); // generate a random color for the new data set
        dataSet.label = correlationLabel(newStockData);
      }

      dataSet.backgroundColor = dataSet.borderColor = dataSet.pointBorderColor = dataSet.pointBackgroundColor =
        dataSet.pointHoverBackgroundColor = dataSet.pointHoverBorderColor = color;

      dataSet.data = stockData[metric][dataSet.label].slice(stockData.startInd, stockData.endInd+1);
      if(stockData.normalized && metric==='prices')
        dataSet = normalizeChartDataset(stockData.normalized, dataSet, stockData);

      // add the dataset to the chartData and update the state
      chartData.datasets.push(dataSet);
      this.setState({ chartData });
    }
  }

  normalizeChartData(normalized) {
    let stockChartData = this.state.stockChartData;
    let stockData = this.state.stockData;
    stockChartData.datasets = this.state.stockChartData.datasets.map(function(dataSet) {
      return normalizeChartDataset(normalized, dataSet, stockData);
    });
    stockData.normalized = normalized;
    this.setState({ stockData });
    this.setState({ stockChartData });
  }

  async removeChartStocks(delStocks) {

    let stockChartData = this.state.stockChartData;
    let newDataSets = [];

    await stockChartData.datasets.forEach((dataSet) => {
      if (!delStocks.includes(dataSet['label']))
        newDataSets.push(dataSet);
    });

    stockChartData.datasets = newDataSets;
    this.setState({ stockChartData })
  }

  tooltipStock(tooltipItem, data) {
    let ticker = data.datasets[tooltipItem.datasetIndex].label;
    let name = this.props.stockName[ticker];
    return name+' ('+ticker+')';
  }
}

function normalizeChartDataset(normalize, dataSet, stockData) {

  if(normalize){
    let factor = 100.0/dataSet.data[0];
    dataSet.data = dataSet.data.map(function(val) { return factor*val;});
    return dataSet;
  } else {
    dataSet.data = stockData.prices[dataSet.label].slice(stockData.startInd, stockData.endInd+1);
    return dataSet;
  }
}

const origDataSet = JSON.stringify({
  label: 'Stock Price',
  fill: false,
  lineTension: 0.1,
  backgroundColor: 'rgba(75,192,192,0.4)',
  borderColor: 'rgba(75,192,192,1)',
  borderCapStyle: 'butt',
  borderDash: [],
  borderDashOffset: 0.0,
  borderJoinStyle: 'miter',
  pointBorderColor: 'rgba(75,192,192,1)',
  pointBackgroundColor: '#fff',
  pointBorderWidth: 1,
  pointHoverRadius: 5,
  pointHoverBackgroundColor: 'rgba(75,192,192,1)',
  pointHoverBorderColor: 'rgba(220,220,220,1)',
  pointHoverBorderWidth: 2,
  pointRadius: 1,
  pointHitRadius: 10,
  data: [65, 59, 80, 81, 56, 55, 40]
});

// Chart Configuration Options

const baseOptions = {
  scales: {
    yAxes: [{
      scaleLabel: {
        display: true,
        fontSize: 14
      },
      ticks: {},
      // offset: true
    }],
    xAxes: [{ticks: {}}]
  },
  tooltips: {
    position: 'nearest',
    bodyFontSize: 14,
    footerFontStyle: 'normal',
    footerFontSize: 14,
    callbacks: {}
  },
  layout: {padding: {}}
};

let baseOptionsCopy = copy(baseOptions);
baseOptionsCopy.scales.yAxes[0].scaleLabel.labelString = 'Stock Price';
const dollarOptions = baseOptionsCopy;

const dollarCallback = value => '$' + value; // Include a dollar sign in the ticks

const dollarTooltip = (tooltipItem, data) => 'Price: $ '+parseFloat(tooltipItem[0].yLabel).toFixed(2);

baseOptionsCopy = copy(baseOptions);
baseOptionsCopy.scales.yAxes[0].scaleLabel.labelString = 'Stock Performance';
const percentOptions = baseOptionsCopy;

const percentCallback = value => value+' %'; // Include a dollar sign in the ticks

const percentTooltip = (tooltipItem, data) => {
  let val = parseFloat(tooltipItem[0].yLabel).toFixed(1);
  return 'Gain: '+val+'%';
};

baseOptionsCopy = copy(baseOptions);
baseOptionsCopy.scales.yAxes[0].scaleLabel.labelString = 'Correlation Coefficient';
baseOptionsCopy.tooltips.callbacks.title = () => null;
baseOptionsCopy.tooltips.callbacks.label = (tooltipItem, data) => data.datasets[tooltipItem.datasetIndex].label;
baseOptionsCopy.tooltips.callbacks.beforeFooter = (tooltipItem, data) => 'Date: ' + tooltipItem[0].xLabel;
baseOptionsCopy.tooltips.callbacks.afterFooter = (tooltipItem, data) => 'Corr: '+parseFloat(tooltipItem[0].yLabel).toFixed(2);
baseOptionsCopy.layout.padding.left = 15;
const corrOptions = baseOptionsCopy;

function correlationLabel(stockData){
  let dataSets;
  if(stockData.currency)
    dataSets = stockData.stock+' , '+stockData.currency;
  else
    dataSets = stockData.stock1+' , '+stockData.stock2;
  return ' Corr ( '+dataSets+' )';
}

// Color Generation

let colors = [];
const lightThreshold = 0.8;
const distThreshold = 200;
const iterations = 50;

function getRandomColor() {

  let bestColor = {minDist: 0, color: '', lightness: 1};
  let i = 0;
  while(i < iterations && (bestColor.minDist < distThreshold || bestColor.lightness >= lightThreshold)) {
    let newColor = generateColor();
    let newDist = getMinDist(newColor);
    let newLightness = colorLightness(newColor);
    if((newLightness < lightThreshold) &&
      ((newLightness < bestColor.lightness && newDist > distThreshold) || (newDist > bestColor.minDist))){
      bestColor.minDist = newDist;
      bestColor.color = newColor;
    }
    i++;
  }
  colors.push(bestColor.color);
  return bestColor.color;
}

function generateColor() {
  let letters = '0123456789ABCDEF';
  let newColor = '#';
  for (let i = 0; i < 6; i++) {
    newColor += letters[Math.floor(Math.random() * 16)];
  }
  return newColor;
}

function getMinDist(newColor) {
  let minDist = 1000;
  let newTriplet = tripletValues(newColor);
  for(let oldColor of colors){
    let oldTriplet = tripletValues(oldColor);
    let dist = colorDistance(newTriplet, oldTriplet);
    if(dist < minDist)
      minDist = dist;
  }
  return minDist;
}

function tripletValues(color){
  let r = parseInt(color.slice(1, 3), 16);
  let g = parseInt(color.slice(3, 5), 16);
  let b = parseInt(color.slice(5, 7), 16);
  return [r,g,b];
}

function colorDistance(triplet1, triplet2){
  let diffR = Math.abs(triplet1[0] - triplet2[0]);
  let diffG = Math.abs(triplet1[1] - triplet2[1]);
  let diffB = Math.abs(triplet1[2] - triplet2[2]);
  return diffR + diffG + diffB;
}

function colorLightness(color){
  let vals = tripletValues(color);
  let r=vals[0], g=vals[1], b=vals[2];
  r /= 255; g /= 255; b /= 255;
  let max = Math.max(r, g, b), min = Math.min(r, g, b);
  return (max + min) / 2;
}

// Miscellaneous

function arr_diff(arr1, arr2){
  return arr1.filter(x => !arr2.includes(x));
}

// From https://stackoverflow.com/questions/8584902/get-closest-number-out-of-array
function binSearch(num, arr) {
  let mid;
  let lo = 0;
  let hi = arr.length - 1;
  while (hi - lo > 1) {
    mid = Math.floor ((lo + hi) / 2);
    if (arr[mid] < num) {
      lo = mid;
    } else {
      hi = mid;
    }
  }
  if (num - arr[lo] <= arr[hi] - num) {
    return arr[lo];
  }
  return hi;
}

function copy(obj){
  return JSON.parse(JSON.stringify(obj))
}

export default StockChart;
