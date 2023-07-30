async function project() {

    // paths to the datasets
    var airlinesPath = "data/airlines.csv";
    var airportsPath = "data/airports.csv";
    var flightsPath = "data/shuffled_flights.csv";
    var usStateBoundariesPath = "data/us-state-boundaries.csv";

    // read in each dataset
    var airlines = d3.csv(airlinesPath);
    var airports = d3.csv(airportsPath, function(row) {
        return {
            "IATA_CODE": row["IATA_CODE"],
            "AIRPORT": row["AIRPORT"],
            "CITY": row["CITY"],
            "STATE": row["STATE"],
            "COUNTRY": row["COUNTRY"],
            "LATITUDE": parseFloat(row["LATITUDE"]),
            "LONGITUDE": parseFloat(row["LONGITUDE"])
        };
    })
    var flights = d3.csv(flightsPath, function(row) {
        return {
            "YEAR": parseInt(row["YEAR"]),
            "MONTH": parseInt(row["MONTH"]),
            "DAY": parseInt(row["DAY"]),
            //"DAY_OF_WEEK": parseInt(row["DAY_OF_WEEK"]),
            "AIRLINE": row["AIRLINE"],
            //"FLIGHT_NUMBER": parseInt(row["FLIGHT_NUMBER"]),
            //"TAIL_NUMBER": row["TAIL_NUMBER"],
            "ORIGIN_AIRPORT": row["ORIGIN_AIRPORT"],
            "DESTINATION_AIRPORT": row["DESTINATION_AIRPORT"],
            "DEPARTURE_DELAY": parseInt(row["DEPARTURE_DELAY"]),
            "ARRIVAL_DELAY": parseInt(row["ARRIVAL_DELAY"]),
            "CANCELLED": parseInt(row["CANCELLED"])
        };
    })
    var usStateBoundaries = d3.dsv(';', usStateBoundariesPath, function(row) {
        return {
            "name": row["name"],
            "St Asgeojson": JSON.parse(row["St Asgeojson"]),
            "stusab": row["stusab"],
            "region": parseInt(row["region"])
        };
    });
    
    // asynchronous data parsing
    airlines = await airlines;
    airports = await airports;
    flights = await flights;
    usStateBoundaries = await usStateBoundaries;

    // plot each graph
    choropleth(airports, flights, usStateBoundaries);
    stackedBarChart(flights);
    scatterPlot(flights);
    histogram(flights);
    matrix(airports, flights);
    streamgraph(flights);
}


var choropleth = function(airports, flights, usStateBoundaries) {
    /*
    Takes in relevant data to plot a choropleth of U.S. states, colored by how frequent flights
    originating in the state are cancelled or delayed.

    Parameters
    ----------
    airports : array
        Dataset of airports with corresponding city and states.

    flights : array
        Dataset of flights containing time of flight, delays, cancellations, origin airport, etc...

    usStateBoundaries : array
        Geospatial dataset of U.S. states encoded as polygons with names and abbreviated names.

    
    Returns
    -------
    None

    */

    // specify number of color schemes the user can choose from and find the currently selected scheme
    const colorSchemes = d3.range(1, 5 + 1);
    var currentScheme = colorSchemes[0];
    colorSchemes.forEach(function(scheme) {
        var schemeID = "#choropleth_scheme" + scheme;
        var schemeNode = d3.select(schemeID).node();
        if(schemeNode.checked) {
            currentScheme = scheme;
        }
    })

    // filter out U.S. territories (e.g., Virgin Islands, Guam, etc...)
    usStateBoundaries = usStateBoundaries.filter(function(place) {
        return place["region"] != 9;
    });
    var statesStusab = [];
    usStateBoundaries.forEach(function(state) {
        statesStusab.push(state["stusab"]);
    })

    // attach state abbreviations to each flight entry and find if each flight was cancelled or delayed
    flights.forEach(function(flight, index) {
        var cancellation = flight["CANCELLATION"];
        var delay = flight["DEPARTURE_DELAY"];
        var cd = (cancellation || delay > 0);

        var origin = flight["ORIGIN_AIRPORT"];
        var match = airports.filter(function(airport) {
            return airport["IATA_CODE"] == origin;
        })
        if(match.length > 0) {
            var state = match[0]["STATE"];
        }
        else {
            var state = "Other";
        }
        flight["STATE"] = state;
        flight["CD"] = cd;
    });

    // filter out U.S. territories from the dataset
    var filtered = flights.filter(function(flight) {
        return statesStusab.includes(flight["STATE"]);
    });

    // group the flights by state and find cancelled / delayed proportions
    var grouped = d3.rollup(
        filtered, 
        function(flight) { return d3.mean(flight, function(flight) { return flight["CD"] }); }, 
        function(flight) { return flight["STATE"]}
        )
    
    // find min and max cancelled / delayed proportions
    var cdMin = d3.min(Array.from(grouped.values()));
    var cdMax = d3.max(Array.from(grouped.values()));

    // bin the cancelled / delayed values into 4 bins
    var nBins = 4;
    var nThresholds = nBins - 1; 
    var thresholds = [];
    var interval = (cdMax - cdMin)/nBins;
    d3.range(nThresholds).forEach(function(i) {
        if(i == 0) {
            thresholds.push(cdMin + interval);
        }
        else if(i == nThresholds) {
            thresholds.push(cdMax);
        }
        else {
            var prev = thresholds[i - 1];
            thresholds.push(prev + interval);
        }
    })
    var binGen = d3.bin()
                    .domain([cdMin, cdMax])
                    .thresholds(thresholds);
    var bins = binGen(Array.from(grouped.values()));

    // match each cancelled / delayed value to their corresponding bin
    var binDict = {};
    bins.forEach(function(bin, index) {
        bin.forEach(function(value) {
            binDict[value] = index;
        })
    })
    
    // find the min and max longitude
    var xTotalMin = d3.min(usStateBoundaries, function(state) {
        var geometry = state["St Asgeojson"];
        if(geometry["type"] == "Polygon") {
            var coordinates = geometry["coordinates"][0];
            return d3.min(coordinates, function(array) {
                return array[0];
            })
        }
        else {
            var coordinateArrays = geometry["coordinates"];
            return d3.min(coordinateArrays, function(coordinateArray) {
                return d3.min(coordinateArray[0], function(array) {
                    return array[0];
                })
            })
        }
    })
    var xTotalMax = d3.max(usStateBoundaries, function(state) {
        var geometry = state["St Asgeojson"];
        if(geometry["type"] == "Polygon") {
            var coordinates = geometry["coordinates"][0];
            return d3.max(coordinates, function(array) {
                var x = array[0];
                // ignore values beyond the Prime Meridian (0 degrees Longitude)
                if(x > 0) {
                    return -Infinity;
                }
                else {
                    return x;
                }
            })
        }
        else {
            var coordinateArrays = geometry["coordinates"];
            return d3.max(coordinateArrays, function(coordinateArray) {
                return d3.max(coordinateArray[0], function(array) {
                    var x = array[0];
                    // ignore values beyond the Prime Meridian (0 degrees Longitude)
                    if(x > 0) {
                        return -Infinity;
                    }
                    else {
                        return x;
                    }
                })
            })
        }
    })

    // find the min and max latitude
    var yTotalMin = d3.min(usStateBoundaries, function(state) {
        var geometry = state["St Asgeojson"];
        if(geometry["type"] == "Polygon") {
            var coordinates = geometry["coordinates"][0];
            return d3.min(coordinates, function(array) {
                return array[1];
            })
        }
        else {
            var coordinateArrays = geometry["coordinates"];
            return d3.min(coordinateArrays, function(coordinateArray) {
                return d3.min(coordinateArray[0], function(array) {
                    return array[1];
                })
            })
        }
    })
    var yTotalMax = d3.max(usStateBoundaries, function(state) {
        var geometry = state["St Asgeojson"];
        if(geometry["type"] == "Polygon") {
            var coordinates = geometry["coordinates"][0];
            return d3.max(coordinates, function(array) {
                return array[1];
            })
        }
        else {
            var coordinateArrays = geometry["coordinates"];
            return d3.max(coordinateArrays, function(coordinateArray) {
                return d3.max(coordinateArray[0], function(array) {
                    return array[1];
                })
            })
        }
    })
    
    // initialize SVG attributes
    var svgWidth = 1000;
    var svgHeight = 750;
    var padding = 50;

    // helper function to create a path given an array of coordinate arrays
    var getPath = function(coordinates) {
        var path = '';
        coordinates.forEach(function(position, index) {
            var x = xScale(position[0]);
            var y = yScale(position[1]);
            if(index == 0) {
                path += "M " + x + ',' + y + " L ";
            }
            else if(index == coordinates.length - 1) {
                var first = coordinates[0];
                var firstX = xScale(first[0]);
                var firstY = yScale(first[1]);
                path += firstX + ',' + firstY + " Z";
            }
            else {
                path += x + ',' + y + ' ';
            }
        })
        return path;
    }

    // tooltip for displaying state and cancellation proportion
    var tooltip = d3.select("#choropleth_plot")
                    .append("div")
                    .attr("class", "choropleth_tooltip")
                    .style("opacity", 0);

    // create the SVG
    var svg = d3.select("#choropleth_plot").append("svg")
                .attr("class", "choropleth_svg")
                .attr("width", svgWidth)
                .attr("height", svgHeight);

    // create linear scales to map longitude and latitude to positions on the SVG
    var xScale = d3.scaleLinear()
        .domain([xTotalMin, xTotalMax])
        .range([padding, svgWidth - padding]);
    var yScale = d3.scaleLinear()
        .domain([yTotalMin, yTotalMax])
        .range([svgHeight - padding, padding]);

    // plot each U.S. state onto the canvas and color each according to the bin their value falls in
    svg.selectAll(".choropleth").data(usStateBoundaries).enter().append("path")
        .attr("class", "choropleth_shape")
        .attr("id", function(state) {
            return state["name"];
        })
        .attr('d', function(state) {
            var geometry = state["St Asgeojson"];
            
            if(geometry["type"] == "Polygon") {
                var coordinates = geometry["coordinates"][0];
                return getPath(coordinates);
            }
            else {
                var path = '';
                var coordinateArrays = geometry["coordinates"];
                coordinateArrays.forEach(function(coordinateArray) {
                    path += getPath(coordinateArray[0]);
                })
                return path;
            }
        })
        .on("mouseover", function(event, state) {
            var stusab = state["stusab"];
            var name = state["name"];
            var value = grouped.get(stusab);
            tooltip
                .transition("tooltipMouseOver")
                .duration(100)
                .style("opacity", 0.9);
            tooltip
                .html(name + ": " + Math.round(value*10000)/100 + '%')
                .style("left", event.pageX + "px")
                .style("top", event.pageY + "px");
        })
        .on("mouseon", function(event, state) {
            var stusab = state["stusab"];
            var name = state["name"];
            var value = grouped.get(stusab);
            tooltip
                .transition("tooltipMouseOn")
                .duration(100)
                .style("opacity", 0.9);
            tooltip
                .html(name + ": " + Math.round(value*10000)/100 + '%')
                .style("left", event.pageX + "px")
                .style("top", event.pageY + "px");
        })
        .on("mousemove", function(event, state) {
            var stusab = state["stusab"];
            var name = state["name"];
            var value = grouped.get(stusab);
            tooltip
                .transition("tooltipMouseMove")
                .duration(100)
                .style("opacity", 0.9);
            tooltip
                .html(name + ": " + Math.round(value*10000)/100 + '%')
                .style("left", event.pageX + "px")
                .style("top", event.pageY + "px");
        })
        .on("mouseleave", function(event, state) {
            tooltip
                .transition("tooltipMouseLeave")
                .duration(100)
                .style("opacity", 0);
        })
        .style("stroke", "black")
        .style("fill", function(state) {
            var stusab = state["stusab"];
            if(!(grouped.has(stusab))) {
                return "gray";
            }
            var value = grouped.get(stusab);
            var bin = binDict[value];
            if(currentScheme == 1) {
                return d3.schemeBlues[nBins][bin];
            }
            else if(currentScheme == 2) {
                return d3.schemeReds[nBins][bin];
            }
            else if(currentScheme == 3) {
                return d3.schemeGreens[nBins][bin];
            }
            else if(currentScheme == 4) {
                return d3.schemeOranges[nBins][bin];
            }
            else {
                return d3.schemePurples[nBins][bin];
            }
        });

    // append a title to the choropleth
    svg.append("text")
        .attr("class", "choropleth_title")
        .attr('x', svgWidth/2)
        .attr('y', padding/2)
        .text("Frequency of Cancelled or Delayed Flights by State");

    // append a legend to the choropleth
    var legendFactor = 50;
    svg.selectAll(".choropleth_legend_color").data(d3.range(nBins)).enter().append("rect")
        .attr("class", "choropleth_legend_color")
        .attr('x', function(bin) {
            return svgWidth - legendFactor*(nBins - bin + 1);
        })
        .attr('y', legendFactor*2)
        .attr("width", legendFactor)
        .attr("height", legendFactor/3)
        .style("fill", function(bin) {
            if(currentScheme == 1) {
                return d3.schemeBlues[nBins][bin];
            }
            else if(currentScheme == 2) {
                return d3.schemeReds[nBins][bin];
            }
            else if(currentScheme == 3) {
                return d3.schemeGreens[nBins][bin];
            }
            else if(currentScheme == 4) {
                return d3.schemeOranges[nBins][bin];
            }
            else {
                return d3.schemePurples[nBins][bin];
            }
        });
    svg.selectAll(".choropleth_legend_tick").data(d3.range(thresholds.length)).enter().append("rect")
        .attr("class", "choropleth_legend_tick")
        .attr('x', function(bin) {
            return svgWidth - legendFactor*(nBins - bin) - legendFactor/80;
        })
        .attr('y', legendFactor*2)
        .attr("width", legendFactor/40)
        .attr("height", legendFactor/2)
        .style("fill", "black");
    svg.selectAll(".choropleth_legend_text").data(thresholds).enter().append("text")
        .attr("class", "choropleth_legend_text")
        .attr('x', function(threshold, index) {
            return svgWidth - legendFactor*(nBins - index);
        })
        .attr('y', legendFactor*2.75)
        .text(function(threshold) {
            return Math.round(threshold*10000)/100 + '%';
        });
    svg.append("text")
        .attr("class", "choropleth_legend_title")
        .attr('x', svgWidth - legendFactor*(nBins + 1))
        .attr('y', legendFactor*1.9)
        .text("Cancelled / Delayed Flights (%)");

    // helper function to change the color scheme of the choropleth
    var changeScheme = function() {
        // check to see which color scheme is selected
        colorSchemes.forEach(function(scheme) {
            var schemeID = "#choropleth_scheme" + scheme;
            var schemeNode = d3.select(schemeID).node();
            if(schemeNode.checked) {
                currentScheme = scheme;
            }
        })

        // switch the color scheme of the states according to the selected color cheme
        svg.selectAll(".choropleth_shape")
            .transition("color")
            .duration(1000)
            .style("fill", function(state) {
                var stusab = state["stusab"];
                if(!(grouped.has(stusab))) {
                    return "gray";
                }
                var value = grouped.get(stusab);
                var bin = binDict[value];
                if(currentScheme == 1) {
                    return d3.schemeBlues[nBins][bin];
                }
                else if(currentScheme == 2) {
                    return d3.schemeReds[nBins][bin];
                }
                else if(currentScheme == 3) {
                    return d3.schemeGreens[nBins][bin];
                }
                else if(currentScheme == 4) {
                    return d3.schemeOranges[nBins][bin];
                }
                else {
                    return d3.schemePurples[nBins][bin];
                }
            });
        
        // switch the color scheme of the legend
        svg.selectAll(".choropleth_legend_color").data(d3.range(nBins))
            .transition("color")
            .duration(1000)
            .style("fill", function(bin) {
                if(currentScheme == 1) {
                    return d3.schemeBlues[nBins][bin];
                }
                else if(currentScheme == 2) {
                    return d3.schemeReds[nBins][bin];
                }
                else if(currentScheme == 3) {
                    return d3.schemeGreens[nBins][bin];
                }
                else if(currentScheme == 4) {
                    return d3.schemeOranges[nBins][bin];
                }
                else {
                    return d3.schemePurples[nBins][bin];
                }
            });
    }

    // change the choropleth's color scheme upon changing the radio button
    d3.select("#radio_choropleth").on("change", changeScheme);

}


var stackedBarChart = function(flights) {
    /*
    Takes in flight data to plot a stacked bar chart of flight counts by airline, 
    colored by flight type (e.g., Prompt, Delayed, Cancelled).

    Parameters
    ----------
    flights : array
        Dataset of flights containing time of flight, delays, cancellations, origin airport, etc...

    
    Returns
    -------
    None

    */

    // group the flights by airline and find on time / early flight counts
    var groupedPrompt = d3.rollup(
        flights,
        function(flight) { return d3.sum(flight, function(flight) { return (flight["DEPARTURE_DELAY"] <= 0) }); },
        function(flight) { return flight["AIRLINE"] }
    );

    // group the flights by airline and find cancelled flight counts
    var groupedCancelled = d3.rollup(
        flights, 
        function(flight) { return d3.sum(flight, function(flight) { return flight["CANCELLED"] }); }, 
        function(flight) { return flight["AIRLINE"]}
    );

    // group the flights by airline and find delayed flight counts
    var groupedDelayed = d3.rollup(
        flights,
        function(flight) { return d3.sum(flight, function(flight) { return flight["DEPARTURE_DELAY"] > 0 }); },
        function(flight) { return flight["AIRLINE"] }
    );

    // fetch the airline codes
    var airlineCodes = Array.from(groupedPrompt.keys());

    // create a stack of flight types for each airline
    var map = airlineCodes.map(function(key, index) {
        return {
          "airline": key,
          "prompt": groupedPrompt.get(key),
          "cancelled": groupedCancelled.get(key),
          "delayed": groupedDelayed.get(key)
        }
    });
    const stackKeys = ["prompt", "delayed", "cancelled"];
    var stack = d3.stack().keys(stackKeys);
    var series = stack(map);

    // helper function to add color to each bar
    var colorArray = ["green", "yellow", "red"];
    var colors = function(i) {
        return colorArray[i];
    };

    // initialize SVG variables
    var svgWidth = 1000;
    var svgHeight = 750;
    var padding = 25;
    var yPadding = 100;
    var xPadding = 50;

    // tooltip to display flight counts
    var tooltip = d3.select("#stacked_bar_chart_plot")
                    .append("div")
                    .attr("class", "stacked_bar_chart_tooltip")
                    .style("opacity", 0);

    // create the SVG
    var svg = d3.select("#stacked_bar_chart_plot").append("svg")
                .attr("class", "stacked_bar_chart_svg")
                .attr("width", svgWidth + xPadding)
                .attr("height", svgHeight + yPadding);

    // create ordinal and linear scales to map airline codes and flight counts to the SVG canvas
    var xScale = d3.scaleBand()
                    .domain(airlineCodes)
                    .range([padding + xPadding, svgWidth - padding])
                    .paddingInner(0.05);
    var yScale = d3.scaleLinear()
                    .domain([0, d3.max(map, function(airline) {
                        return airline["prompt"] + airline["cancelled"] + airline["delayed"];
                    })])
                    .range([svgHeight - padding, padding + yPadding]);

    // create axes
    var xAxis = d3.axisBottom().scale(xScale);
    var yAxis = d3.axisLeft().scale(yScale);
    
    // append groups to the SVG
    var groups = svg.selectAll(".stacked_bar_chart_group").data(series).enter().append('g')
                    .attr("class", function(group, index) { return "stacked_bar_chart_group_" + stackKeys[index] })
                    .style("fill", function(group, index) { return colors(index); });
    
    // append rectangles to the SVG for each group
    var rects = groups.selectAll("rect")
                    .data(function(group) {
                        return group;
                    }).enter().append("rect")
                    .attr("class", "stacked_bar_chart_bar")
                    .attr('x', function(group, index) {
                        var airline = airlineCodes[index];
                        return padding + xScale(airline);
                    })
                    .attr('y', function(group) {
                        return yScale(group[1]);
                    })
                    .attr("width", xScale.bandwidth())
                    .attr("height", function(group) {
                        return yScale(group[0]) - yScale(group[1]);
                    })
                    .on("mouseover", function(event, group) {
                        var value = group[1] - group[0];
                        tooltip
                            .transition("tooltipMouseOver")
                            .duration(100)
                            .style("opacity", 0.9);
                        tooltip
                            .html(value + " flight(s)")
                            .style("left", event.pageX + "px")
                            .style("top", event.pageY + "px");
                    })
                    .on("mouseon", function(event, group) {
                        var value = group[1] - group[0];
                        tooltip
                            .transition("tooltipMouseOn")
                            .duration(100)
                            .style("opacity", 0.9);
                        tooltip
                            .html(value + " flight(s)")
                            .style("left", event.pageX + "px")
                            .style("top", event.pageY + "px");
                    })
                    .on("mousemove", function(event, group) {
                        var value = group[1] - group[0];
                        tooltip
                            .transition("tooltipMouseMove")
                            .duration(100)
                            .style("opacity", 0.9);
                        tooltip
                            .html(value + " flight(s)")
                            .style("left", event.pageX + "px")
                            .style("top", event.pageY + "px");
                    })
                    .on("mouseleave", function(event, group) {
                        tooltip
                            .transition("tooltipMouseLeave")
                            .duration(100)
                            .style("opacity", 0);
                    });

    // append axes
    svg.append('g').call(xAxis)
        .attr("class", "stacked_bar_chart_xAxis")
        .attr("transform", "translate(" + padding + ',' + (svgHeight - padding) + ')');
    svg.append('g').call(yAxis)
        .attr("class", "stacked_bar_chart_yAxis")
        .attr("transform", "translate(" + (padding*2 + xPadding) + ",0)");

    // append a title
    svg.append("text")
        .attr("class", "stacked_bar_chart_title")
        .attr('x', svgWidth/2 + xPadding)
        .attr('y', yPadding/4)
        .text("Prompt / Delayed / Cancelled Flight Counts by Airline");

    // append a legend
    var legendFactor = 50;
    svg.selectAll(".stacked_bar_chart_legend_color")
        .data(series).enter().append("rect")
        .attr("class", "stacked_bar_chart_legend_colors")
        .attr('x', padding*2 + xPadding)
        .attr('y', function(group, index) {
            return (index + 1)*padding + padding;
        })
        .attr("width", 10)
        .attr("height", 10)
        .style("fill", function(group, index) {
            return colors(index);
        });
    svg.selectAll(".stacked_bar_chart_legend_text")
        .data(series).enter().append("text")
        .attr("class", "stacked_bar_chart_legend_text")
        .attr('x', padding*2 + legendFactor/3 + xPadding)
        .attr('y', function(group, index) {
            return (index + 1)*padding + padding + 10;
        })
        .text(function(group, index) { return stackKeys[index]; });
    svg.append("text")
        .attr("class", "stacked_bar_chart_legend_title")
        .attr('x', padding*2 + xPadding)
        .attr('y', padding*2 - 10)
        .text("Flight Type");

    // append axis labels
    svg.append("text")
        .attr("class", "stacked_bar_chart_xAxisLabel")
        .attr('x', svgWidth/2 + xPadding)
        .attr('y', svgHeight - padding + 40)
        .text("Airlines IATA Code");
    svg.append("text")
        .attr("class", "stacked_bar_chart_yAxisLabel")
        .attr("transform", "translate(" + (xPadding + 5) + ',' + (svgHeight/2 + yPadding/2) + ")rotate(-90)")
        .text("Count of Flights");

}


var scatterPlot = function(flights) {
    /*
    Takes in flight data to plot a scatter plot of flights, 
    positioned by their departure and arrival delays with an interactive line of regression.

    Parameters
    ----------
    flights : array
        Dataset of flights containing time of flight, delays, cancellations, origin airport, etc...


    Returns
    -------
    None

    */

    // filter out records with missing values for delay values
    var filtered = flights.filter(function(flight) {
        return !(isNaN(flight["DEPARTURE_DELAY"]) || isNaN(flight["ARRIVAL_DELAY"]));
    })

    // obtain min and max departure delays
    xMin = d3.min(filtered, function(flight) { return flight["DEPARTURE_DELAY"] });
    xMax = d3.max(filtered, function(flight) { return flight["DEPARTURE_DELAY"] });

    // obtain min and max arrival delays
    yMin = d3.min(filtered, function(flight) { return flight["ARRIVAL_DELAY"] });
    yMax = d3.max(filtered, function(flight) { return flight["ARRIVAL_DELAY"] });

    // initialize SVG variables
    var svgWidth = 750;
    var svgHeight = 750;
    var padding = 50;
    var xPadding = 50;
    var yPadding = 50;

    // tooltip for displaying departure and arrival delay of each point
    var tooltip = d3.select("#scatter_plot")
        .append("div")
        .attr("class", "scatter_tooltip")
        .style("opacity", 0);

    // create the SVG
    var svg = d3.select("#scatter_plot_plot").append("svg")
                .attr("class", "scatter_plot_svg")
                .attr("width", svgWidth + xPadding)
                .attr("height", svgHeight + yPadding);

    // linear scales to map delay values to the SVG canvas
    var xScale = d3.scaleLinear()
                    .domain([xMin, xMax])
                    .range([padding + xPadding, svgWidth + xPadding - padding]);
    var yScale = d3.scaleLinear()
                    .domain([yMin, yMax])
                    .range([svgHeight - padding, padding]);
    
    // create axes
    var xAxis = d3.axisBottom().scale(xScale);
    var yAxis = d3.axisLeft().scale(yScale);

    // append each point to the plot
    svg.selectAll(".scatter_plot_points").data(filtered).enter().append("circle")
            .attr("class", "scatter_plot_points")
            .attr("cx", function(flight) { return xScale(flight["DEPARTURE_DELAY"]) })
            .attr("cy", function(flight) { return yScale(flight["ARRIVAL_DELAY"]) })
            .attr('r', 2.5)
            .on("mouseover", function(event, flight) {
                tooltip
                    .transition("tooltipMouseOver")
                    .duration(100)
                    .style("opacity", 0.9);
                tooltip
                    .html(
                        "Departure Delay: " + flight["DEPARTURE_DELAY"] + " units<br>" +
                        "Arrival Delay: " + flight["ARRIVAL_DELAY"] + " units"
                        )
                    .style("left", event.pageX + "px")
                    .style("top", event.pageY + "px");
            })
            .on("mouseon", function(event, flight) {
                tooltip
                    .transition("tooltipMouseOn")
                    .duration(100)
                    .style("opacity", 0.9);
                tooltip
                    .html(
                        "Departure Delay: " + flight["DEPARTURE_DELAY"] + " units<br>" +
                        "Arrival Delay: " + flight["ARRIVAL_DELAY"] + " units"
                        )
                    .style("left", event.pageX + "px")
                    .style("top", event.pageY + "px");
            })
            .on("mousemove", function(event, flight) {
                tooltip
                    .transition("tooltipMouseMove")
                    .duration(100)
                    .style("opacity", 0.9);
                tooltip
                    .html(
                        "Departure Delay: " + flight["DEPARTURE_DELAY"] + " units<br>" +
                        "Arrival Delay: " + flight["ARRIVAL_DELAY"] + " units"
                        )
                    .style("left", event.pageX + "px")
                    .style("top", event.pageY + "px");
            })
            .on("mouseleave", function(event, flight) {
                tooltip
                    .transition("tooltipMouseLeave")
                    .duration(100)
                    .style("opacity", 0);
            });

    // append axes
    svg.append('g').call(xAxis)
        .attr("class", "scatter_plot_xAxis")
        .attr("transform", "translate(0," + (svgHeight - padding + 10) + ')');
    svg.append('g').call(yAxis)
        .attr("class", "scatter_plot_yAxis")
        .attr("transform", "translate(" + (padding + xPadding - 10) + ",0)");

    // append a title
    svg.append("text")
        .attr("class", "scatter_plot_title")
        .attr('x', svgWidth/2 + xPadding)
        .attr('y', padding/2)
        .text("Departure Delay vs. Arrival Delay");

    // initialize variables for linear regression
    var sumX = 0;
    var sumY = 0;
    var sumXY = 0;
    var sumXX = 0;
    var count = 0;
    var x = 0;
    var y = 0;

    // compute intermediate statistics
    for(var i = 0; i < filtered.length; i++) {
        var flight = filtered[i];
        x = flight["DEPARTURE_DELAY"];
        y = flight["ARRIVAL_DELAY"];
        sumX += x;
        sumY += y;
        sumXY += x*y;
        sumXX += x*x;
        count++;
    }

    // obtain the y = m*x + b equation
    var slope = (count*sumXY - sumX*sumY) / (count*sumXX - sumX*sumX);
    var intercept = (sumY/count) - (slope*sumX)/count;

    // get predictions for the min and max x values in order to plot the line of regression
    var y1 = intercept + slope*xMin;
    var y2 = intercept + slope*xMax;

    // helper function to make the line appear and disappear upon pressing the [Enter] button
    var hasLine = false;
    var toggleLine = function() {
        if(hasLine) {
            svg.selectAll(".scatter_plot_line")
                .transition("line")
                .duration(1000)
                .style("stroke-opacity", 0);
            svg.selectAll(".scatter_plot_line")
                .on("mouseover", function(event) {
                    tooltip
                        .transition("tooltipMouseOver")
                        .duration(100)
                        .style("opacity", 0);
                })
                .on("mouseon", function(event) {
                    tooltip
                        .transition("tooltipMouseOn")
                        .duration(100)
                        .style("opacity", 0);
                })
                .on("mousemove", function(event) {
                    tooltip
                        .transition("tooltipMouseMove")
                        .duration(100)
                        .style("opacity", 0);
                })
                .on("mouseleave", function(event) {
                    tooltip
                        .transition("tooltipMouseLeave")
                        .duration(100)
                        .style("opacity", 0);
                });
        }
        else {
            svg.selectAll(".scatter_plot_line")
                .transition("line")
                .duration(1000)
                .style("stroke-opacity", 0.9);
            svg.selectAll(".scatter_plot_line")
                .on("mouseover", function(event) {
                    tooltip
                        .transition("tooltipMouseOver")
                        .duration(100)
                        .style("opacity", 0.9);
                    tooltip
                        .html(
                            "Slope: " + Math.round(slope*100)/100 + "<br>" +
                            "Intercept: " + Math.round(intercept*100)/100
                            )
                        .style("left", event.pageX + "px")
                        .style("top", event.pageY + "px");
                })
                .on("mouseon", function(event) {
                    tooltip
                        .transition("tooltipMouseOn")
                        .duration(100)
                        .style("opacity", 0.9);
                    tooltip
                        .html(
                            "Slope: " + Math.round(slope*100)/100 + "<br>" +
                            "Intercept: " + Math.round(intercept*100)/100
                            )
                        .style("left", event.pageX + "px")
                        .style("top", event.pageY + "px");
                })
                .on("mousemove", function(event) {
                    tooltip
                        .transition("tooltipMouseMove")
                        .duration(100)
                        .style("opacity", 0.9);
                    tooltip
                        .html(
                            "Slope: " + Math.round(slope*100)/100 + "<br>" +
                            "Intercept: " + Math.round(intercept*100)/100
                            )
                        .style("left", event.pageX + "px")
                        .style("top", event.pageY + "px");
                })
                .on("mouseleave", function(event) {
                    tooltip
                        .transition("tooltipMouseLeave")
                        .duration(100)
                        .style("opacity", 0);
                });
        }
        hasLine = !hasLine;
    }

    // append the line of regression
    svg.append("line")
        .attr("class", "scatter_plot_line")
        .attr("x1", xScale(xMin))
        .attr("y1", yScale(y1))
        .attr("x2", xScale(xMax))
        .attr("y2", yScale(y2))
        .style("stroke-opacity", 0);

    // event listener to show / hide the line of regression
    d3.select("body")
        .on("keydown", function(event) {
            if(event.key == "Enter") {
                toggleLine();
            } 
        });

    // append axis labels
    svg.append("text")
        .attr("class", "scatter_plot_xAxisLabel")
        .attr('x', svgWidth/2 + xPadding)
        .attr('y', svgHeight - padding + 45)
        .text("Departure Delay");
    svg.append("text")
        .attr("class", "scatter_plot_yAxisLabel")
        .attr("transform", "translate("+(xPadding + 5) + ',' + (svgHeight/2 + yPadding/2) + ")rotate(-90)")
        .text("Arrival Delay");

}


var histogram = function(flights) {
    /*
    Takes in flight data to perform an A/B test on whether or not Southwest Airlines
    tends to have a higher proportion of delayed / cancelled flights than other airlines.

    Parameters
    ----------
    flights : array
        Dataset of flights containing time of flight, delays, cancellations, origin airport, etc...

    
    Returns
    -------
    None

    */

    // record labels for if the flight airline matches the target airline of interest and attach whether or not the flight was cancelled or delayed
    var studyAirline = "WN";
    var isTarget = [];
    flights.forEach(function(flight) {
        flight["isTarget"] = (flight["AIRLINE"] == studyAirline);
        flight["CD"] = (flight["CANCELLED"] || flight["DEPARTURE_DELAY"] > 0);
        isTarget.push(flight["isTarget"]);
    })

    // group the flights by whether or not the flight airline is the airline of interest and fetch proportions of cancelled / delayed flights
    var observations = d3.rollup(
        flights,
        function(flight) { return d3.mean(flight, function(flight) { return flight["CD"] }); },
        function(flight) { return flight["isTarget"] }
    );

    // obtain the observed proportion of cancelled / delayed flights for the airline of interest
    var observedStat = observations.get(true);
    
    // perform an A/B test
    var alpha = 0.01;
    var numSimulations = 100;
    var results = [];
    var labelCount = d3.sum(isTarget);
    d3.range(numSimulations).forEach(function(j) {
        var newLabels = isTarget.sort(function() { return Math.random() - 0.5 });
        var sum = 0;
        flights.forEach(function(flight, index) {
            if(newLabels[index] && flight["CD"]) {
                sum++;
            }
        })
        var result = sum/labelCount;
        results.push(result);
    })
    
    // fetch the p-value for the hypothesis test
    var pValue = d3.mean(results, function(element) { return (element >= observedStat) });

    // obtain a conclusion for the hypothesis test
    var reject = pValue < alpha;

    // output the p-value and conclusion in the HTML
    d3.select("#histogram_p_value")
        .append("text").text(pValue + '.');
    d3.select("#histogram_conclusion")
        .append("text").text(reject);

    // find min and max cancelled / delayed proportions from results
    var cdMin = d3.min(results)
    var cdMax = d3.max(results)

    // bin the cancelled / delayed values into 8 bins
    var nBins = 8;
    var nThresholds = nBins - 1; 
    var thresholds = [];
    var interval = (cdMax - cdMin)/nBins;
    d3.range(nThresholds).forEach(function(i) {
        if(i == 0) {
            thresholds.push(cdMin + interval);
        }
        else if(i == nThresholds) {
            thresholds.push(cdMax);
        }
        else {
            var prev = thresholds[i - 1];
            thresholds.push(prev + interval);
        }
    })
    var binGen = d3.bin()
                    .domain([cdMin, cdMax])
                    .thresholds(thresholds);
    var bins = binGen(results);

    // create an array of all the possible extreme values for helping the scales to determine an appropriate domain
    var possibleExtremes = [cdMin, cdMax, observedStat];

    // initialize SVG variables
    var svgWidth = 1000;
    var svgHeight = 500;
    var padding = 50;
    var yPadding = padding*2;
    var xPadding = 50;

    // tooltip for displaying distribution counts
    var tooltip = d3.select("#histogram_plot")
        .append("div")
        .attr("class", "histogram_tooltip")
        .style("opacity", 0);

    // create the SVG
    var svg = d3.select("#histogram_plot").append("svg")
                .attr("class", "histogram_svg")
                .attr("width", svgWidth + xPadding*1.1)
                .attr("height", svgHeight + yPadding);

    // linear scales to map proportions and frequency to the SVG canvas
    var xScale = d3.scaleLinear()
                    .domain([
                        d3.min(possibleExtremes),
                        d3.max(possibleExtremes)
                    ])
                    .range([padding + xPadding, svgWidth - padding + xPadding]);
    var yScale = d3.scaleLinear()
                    .domain([
                        //d3.min(bins, function(bin) { return bin.length }),
                        0,
                        d3.max(bins, function(bin) { return bin.length })
                    ])
                    .range([svgHeight - padding, padding]);

    // create axes
    var xAxis = d3.axisBottom().scale(xScale);
    var yAxis = d3.axisLeft().scale(yScale);

    // append bars for each histogram bin to the plot
    svg.selectAll(".histogram_bars").data(bins).enter().append("rect")
            .attr("class", "histogram_bars")
            .attr('x', function(bin, index) {
                if(index == 0) {
                    return xScale(d3.min(possibleExtremes));
                }
                else {
                    return xScale(thresholds[index - 1]);
                }
            })
            .attr('y', function(bin) {
                return yScale(bin.length);
            })
            .attr("width", function(bin, index) {
                return xScale(thresholds[1]) - xScale(thresholds[0]);
            })
            .attr("height", function(bin) {
                return svgHeight - yScale(bin.length) - padding;
            })
            .on("mouseover", function(event, bin) {
                var value = bin.length;
                tooltip
                    .transition("tooltipMouseOver")
                    .duration(100)
                    .style("opacity", 0.9);
                tooltip
                    .html("Count: " + value)
                    .style("left", event.pageX + "px")
                    .style("top", event.pageY + "px");
            })
            .on("mouseon", function(event, bin) {
                var value = bin.length;
                tooltip
                    .transition("tooltipMouseOn")
                    .duration(100)
                    .style("opacity", 0.9);
                tooltip
                    .html("Count: " + value)
                    .style("left", event.pageX + "px")
                    .style("top", event.pageY + "px");
            })
            .on("mousemove", function(event, bin) {
                var value = bin.length;
                tooltip
                    .transition("tooltipMouseMove")
                    .duration(100)
                    .style("opacity", 0.9);
                tooltip
                    .html("Count: " + value)
                    .style("left", event.pageX + "px")
                    .style("top", event.pageY + "px");
            })
            .on("mouseleave", function(event, bin) {
                tooltip
                    .transition("tooltipMouseLeave")
                    .duration(100)
                    .style("opacity", 0);
            });

    // append axes
    svg.append('g').call(xAxis)
        .attr("class", "histogram_xAxis")
        .attr("transform", "translate("+ 0 + "," + (svgHeight - padding) + ')');
    svg.append('g').call(yAxis)
        .attr("class", "histogram_yAxis")
        .attr("transform", "translate(" + (padding+xPadding) + "," + 0 + ")");

    // append the observed value to the histogram
    svg.append("circle")
        .attr("class", "histogram_observation")
        .attr("cx", xScale(observedStat))
        .attr("cy", svgHeight - padding)
        .attr('r', 5)
        .style("fill", "red")
        .on("mouseover", function(event, bin) {
            var value = observedStat;
            tooltip
                .transition("tooltipMouseOver")
                .duration(100)
                .style("opacity", 0.9);
            tooltip
                .html("Proportion: " + value)
                .style("left", event.pageX + "px")
                .style("top", event.pageY + "px");
        })
        .on("mouseon", function(event, bin) {
            var value = observedStat;
            tooltip
                .transition("tooltipMouseOn")
                .duration(100)
                .style("opacity", 0.9);
            tooltip
                .html("Proportion: " + value)
                .style("left", event.pageX + "px")
                .style("top", event.pageY + "px");
        })
        .on("mousemove", function(event, bin) {
            var value = observedStat;
            tooltip
                .transition("tooltipMouseMove")
                .duration(100)
                .style("opacity", 0.9);
            tooltip
                .html("Proportion: " + value)
                .style("left", event.pageX + "px")
                .style("top", event.pageY + "px");
        })
        .on("mouseleave", function(event, bin) {
            tooltip
                .transition("tooltipMouseLeave")
                .duration(100)
                .style("opacity", 0);
        });

    // append a title
    svg.append("text")
        .attr("class", "histogram_title")
        .attr('x', svgWidth/2 + xPadding)
        .attr('y', padding/2)
        .text("Expected Distribution of Cancelled / Delayed Flights Under the Null Hypothesis");

    // append axis labels
    svg.append("text")
        .attr("class", "histogram_xAxisLabel")
        .attr('x', svgWidth/2 + xPadding)
        .attr('y', svgHeight - padding + 35)
        .text("Proportion of Cancelled / Delayed Flights");
    svg.append("text")
        .attr("class", "histogram_yAxisLabel")
        .attr("transform", "translate(" + (xPadding + 20) + ',' + (svgHeight/2 + padding/2 + 10) + ")rotate(-90)")
        .text("Frequency");

}


var matrix = function(airports, flights) {
    /*
    Takes in relevant data to plot a matrix of Californian airport paths, 
    colored by whether or not the path has cancelled flights.

    Parameters
    ----------
    airports : array
        Dataset of airports with corresponding city and states.

    flights : array
        Dataset of flights containing time of flight, delays, cancellations, origin airport, etc...

    
    Returns
    -------
    None

    */

    // filter for only Californian airports and retrieve their codes
    var CAAirports = airports.filter(function(airport) {
        return airport["STATE"] == "CA";
    })
    var CAAirportDict = {}
    CAAirports.forEach(function(airport) {
        var airportName = airport["AIRPORT"];
        var airportCode = airport["IATA_CODE"];
        CAAirportDict[airportCode] = airportName;
    });
    var CAAirportNames = Object.values(CAAirportDict);
    var CAAirportCodes = Object.keys(CAAirportDict);
    
    // filter flights for only flights occurring within California
    var CAFlights = flights.filter(function(flight) {
        return CAAirportCodes.includes(flight["ORIGIN_AIRPORT"]) && CAAirportCodes.includes(flight["DESTINATION_AIRPORT"]);
    });
    
    // create data structures for storing (origin, destination) pairs and their values
    var grouped = {};
    var groups = [];
    CAAirportCodes.forEach(function(origin) {
        grouped[origin] = {};
        var originDict = grouped[origin];
        CAAirportCodes.forEach(function(destination) {
            groups.push([origin, destination]);

            var matches = CAFlights.filter(function(flight) {
                return (((flight["DESTINATION_AIRPORT"] == origin && flight["ORIGIN_AIRPORT"] == destination)
                || (flight["ORIGIN_AIRPORT"] == origin && flight["DESTINATION_AIRPORT"] == destination)) && flight["CANCELLED"]);
            })
            originDict[destination] = (0 + (matches.length > 0));
        });
    });
    
    // initialize SVG variables
    var svgWidth = 750;
    var svgHeight = 750;
    var padding = 50;
    var xPadding = 50;
    var yPadding = 30;

    // tooltip for displaying whether or not the path between two airports has cancelled flights
    var tooltip = d3.select("#matrix_plot")
                    .append("div")
                    .attr("class", "matrix_tooltip")
                    .style("opacity", 0);

    // create the SVG
    var svg = d3.select("#matrix_plot").append("svg")
                .attr("class", "matrix_svg")
                .attr("width", svgWidth + xPadding)
                .attr("height", svgHeight + yPadding);

    // fetch the airport codes in reverse order for appending to the y-axis
    var flippedCodes = Object.keys(CAAirportDict).reverse();

    // ordinal scales for scaling airport codes to the SVG canvas
    var xScale = d3.scaleBand()
                    .domain(CAAirportCodes)
                    .range([padding + xPadding, svgWidth - padding + xPadding])
                    .paddingInner(0.1);
    var yScale = d3.scaleBand()
                    .domain(flippedCodes)
                    .range([svgHeight - padding + yPadding, padding + yPadding])
                    .paddingInner(0.1);

    // axes
    var xAxis = d3.axisTop().scale(xScale);
    var yAxis = d3.axisLeft().scale(yScale);

    // build the adjacency matrix
    svg.selectAll(".matrix_rects").data(groups).enter().append("rect")
            .attr("class", "matrix_rects")
            .attr('x', function(group) {
                var destination = group[1];
                return xScale(destination);
            })
            .attr('y', function(group) {
                var origin = group[0];
                return yScale(origin);
            })
            .attr("width", xScale.bandwidth())
            .attr("height", yScale.bandwidth())
            .on("mouseover", function(event, group) {
                var origin = group[0];
                var destination = group[1];
                var value = grouped[origin][destination];
                var output = '';
                if(origin == destination) {
                    output = "NA";
                }
                else if(value) {
                    output = "Has Cancelled Flights";
                }
                else {
                    output = "No Cancelled Flights";
                }
                tooltip
                    .transition("tooltipMouseOver")
                    .duration(100)
                    .style("opacity", 0.9);
                tooltip
                    .html(origin + " to " + destination + ": " + output)
                    .style("left", event.pageX + "px")
                    .style("top", event.pageY + "px");
            })
            .on("mouseon", function(event, group) {
                var origin = group[0];
                var destination = group[1];
                var value = grouped[origin][destination];
                var output = '';
                if(origin == destination) {
                    output = "NA";
                }
                else if(value) {
                    output = "Has Cancelled Flights";
                }
                else {
                    output = "No Cancelled Flights";
                }
                tooltip
                    .transition("tooltipMouseOn")
                    .duration(100)
                    .style("opacity", 0.9);
                tooltip
                    .html(origin + " to " + destination + ": " + output)
                    .style("left", event.pageX + "px")
                    .style("top", event.pageY + "px");
            })
            .on("mousemove", function(event, group) {
                var origin = group[0];
                var destination = group[1];
                var value = grouped[origin][destination];
                var output = '';
                if(origin == destination) {
                    output = "NA";
                }
                else if(value) {
                    output = "Has Cancelled Flights";
                }
                else {
                    output = "No Cancelled Flights";
                }
                tooltip
                    .transition("tooltipMouseMove")
                    .duration(100)
                    .style("opacity", 0.9);
                tooltip
                    .html(origin + " to " + destination + ": " + output)
                    .style("left", event.pageX + "px")
                    .style("top", event.pageY + "px");
            })
            .on("mouseleave", function(event, group) {
                tooltip
                    .transition("tooltipMouseLeave")
                    .duration(100)
                    .style("opacity", 0);
            })
            .style("fill", function(group) {
                var origin = group[0];
                var destination = group[1];
                var value = grouped[origin][destination];
                if(origin == destination) {
                    return "gray";
                }
                else if(value) {
                    return "red";
                }
                else {
                    return "green";
                }
            });

    // append the axes
    svg.append('g').call(xAxis)
            .attr("class", "matrix_xAxis")
            .attr("transform", "translate(0," + (yPadding + padding) + ')');
    svg.append('g').call(yAxis)
            .attr("class", "matrix_yAxis")
            .attr("transform", "translate(" + (xPadding + padding) + ",0)");

    // append a title
    svg.append("text")
        .attr("class", "matrix_title")
        .attr('x', svgWidth/2 + xPadding)
        .attr('y', padding/3)
        .text("Flight Paths Within California");

    // append axis labels
    svg.append("text")
        .attr("class", "matrix_xAxisLabel")
        .attr('x', svgWidth/2 + xPadding)
        .attr('y', xPadding)
        .text("Airport");
    svg.append("text")
        .attr("class", "matrix_yAxisLabel")
        .attr("transform", "translate(" + (xPadding + 5) + ',' + (svgHeight/2 + padding/2) + ")rotate(-90)")
        .text("Airport");

}

var streamgraph = function(flights) {
    /*
    Takes in flight data to plot a stream graph of flight counts over months for West Coast states,
    colored by the different state.

    Parameters
    ----------
    flights : array
        Dataset of flights containing time of flight, delays, cancellations, origin airport, etc...

    
    Returns
    -------
    None

    */

    // array of West Coast states
    var WC = ["CA", "OR", "WA"];
    // filter for only flights departing from the West Coast
    var filtered = flights.filter(function(flight) {
        return WC.includes(flight["STATE"]);
    });
    // group the flights by month number and state
    var grouped = d3.rollup(
        filtered,
        function(flight) { return d3.count(flight, function(row) { return row["MONTH"]}) },
        function(flight) { return flight["MONTH"] },
        function(flight) { return flight["STATE"] }
    );

    // build the stack to create a streamgraph with
    var months = Array.from(grouped.keys()).sort(function(a, b) { return a - b; });
    var toStack = [];
    months.forEach(function(month) {
        var monthDict = {"month": month};
        var groupedMap = grouped.get(month);
        WC.forEach(function(state) {
            monthDict[state] = groupedMap.get(state);
        });
        toStack.push(monthDict);
    });
    var stack = d3.stack().keys(WC)(toStack);

    // helper function to choose a color based on stream group
    var colorArray = ["blue", "orange", "green"];
    var colors = function(i) {
        return colorArray[i];
    };

    // initialize SVG variables
    var svgWidth = 1000;
    var svgHeight = 500;
    var padding = 70;
    var yPadding = 100;
    var xPadding = 50;

    // ordinal and linear scales to map months and counts to the SVG canvas, respectively
    var xScale = d3.scaleBand()
                    .domain(months)
                    .range([padding + xPadding, svgWidth - padding + xPadding])
                    .paddingInner(1);
    var yScale = d3.scaleLinear()
                    .domain([
                        0,
                        d3.max(toStack, function(row) {
                            var sum = 0;
                            WC.forEach(function(state) {
                                sum += row[state];
                            })
                            return sum;
                        })
                    ])
                    .range([svgHeight - padding, padding + yPadding]);

    // axes
    var xAxis = d3.axisBottom().scale(xScale);
    var yAxis = d3.axisLeft().scale(yScale);

    // create the SVG
    var svg = d3.select("#stream_plot").append("svg")
                .attr("class", "stream_svg")
                .attr("width", svgWidth)
                .attr("height", svgHeight + yPadding);
            
    // plot each stream layer on the SVG
    svg.selectAll(".stream_layer").data(stack).enter().append("path")
        .attr("class", "stream_layer")
        .attr(
            'd',
            d3.area()
                .x(function(layer, index) {
                    var month = months[index];
                    return xScale(month);
                })
                .y0(function(layer) { return yScale(layer[0]); })
                .y1(function(layer) { return yScale(layer[1]); })
        )
        .style("fill", function(layer, index) {
            return colors(index);
        });

    // append axes
    svg.append('g').call(xAxis)
        .attr("class", "stream_xAxis")
        .attr("transform", "translate(0," + (svgHeight - padding) + ')');
    svg.append('g').call(yAxis)
        .attr("class", "stream_yAxis")
        .attr("transform", "translate(" + (xPadding + padding) + ",0)");

    // append a title
    svg.append("text")
        .attr("class", "stream_title")
        .attr('x', svgWidth/2 + xPadding)
        .attr('y', padding/2)
        .text("Flight Count by State Over Months");

    // append a legend
    var legendFactor = 50;
    svg.selectAll(".stream_legend_colors")
        .data(stack).enter().append("rect")
        .attr("class", "stream_legend_colors")
        .attr('x', padding*2 + xPadding)
        .attr('y', function(layer, index) {
            return (index + 1)*padding/4 + padding;
        })
        .attr("width", 10)
        .attr("height", 10)
        .style("fill", function(layer, index) {
            return colors(index);
        });
    svg.selectAll(".stream_legend_text")
        .data(stack).enter().append("text")
        .attr("class", "stream_legend_text")
        .attr('x', padding*2 + legendFactor/3 + xPadding)
        .attr('y', function(layer, index) {
            return (index + 1)*padding/4 + padding + 10;
        })
        .text(function(layer) { return layer.key; });
    svg.append("text")
        .attr("class", "stream_legend_title")
        .attr('x', padding*2 + xPadding)
        .attr('y', padding*1.1)
        .text("State");

    // append axis labels
    svg.append("text")
        .attr("class", "stream_xAxisLabel")
        .attr('x', svgWidth/2 + xPadding)
        .attr('y', svgHeight - padding + 40)
        .text("Month");
    svg.append("text")
        .attr("class", "stream_yAxisLabel")
        .attr("transform", "translate("+(xPadding+padding/2)+","+(svgHeight/2+yPadding+padding/1.5)+")rotate(-90)")
        .text("Count of Departing Flights");

}