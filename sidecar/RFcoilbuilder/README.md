# coilbuilding
Tools under development for coil design and building in the low field lab at VUIIS

## Simulation 
Install the Python dependencies, including PuLP's CBC solver:

```sh
python3 -m pip install numpy scipy matplotlib "pulp[cbc]"
python3 coil_optimisation_v1.3_DIYMRI.py
```

This generates PNG images for the B1 field and winding pattern, plus a winding-table CSV. You may want to tune parameters within this file to generate a uniform B1 field.

<img src="https://github.com/csappo/RFcoilbuilder/blob/main/01_field_performance.png">

<img src="https://github.com/csappo/RFcoilbuilder/blob/main/03_coil_developed_view.png">


## STL creation for 3D printing
The above code with generate a csv file, run the following to generate STL file

```python generate_former_stl.py```

update path to ```default_csv``` in the file

